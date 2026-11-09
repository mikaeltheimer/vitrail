-- Donivers — schéma complet de la base (état au 2026-11-09 : migrations jusqu'à 2026-11-18-resserrer-2.sql comprise).
--
-- Sert à créer un projet Supabase NEUF en une fois (SQL Editor, ou psql). Une base déjà en service se met à jour avec les
-- fichiers de supabase/migrations/, dans l'ordre de leur nom ; l'histoire et les raisons de chaque choix sont dans leurs
-- commentaires. Ce fichier est GÉNÉRÉ depuis une base où toutes les migrations ont été appliquées (pg_dump --schema-only),
-- puis vérifié : un projet construit avec lui seul a exactement la structure de donivers-test (colonnes, contraintes,
-- index, vues, déclencheurs, RLS, droits, bucket). Ne pas le modifier à la main : le régénérer après chaque migration.
--
-- Personne n'accède à ces tables depuis le navigateur : seul le serveur (clé service_role) les lit et les écrit. RLS est
-- activé sans aucune politique et les droits d'anon et authenticated sont retirés.

create extension if not exists pgcrypto with schema extensions;

CREATE FUNCTION public.donations_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.organization_id <> old.organization_id or new.vitrail_id <> old.vitrail_id then
    raise exception 'L''organisme et le vitrail d''un don ne changent jamais';
  end if;
  return new;
end $$;

CREATE FUNCTION public.organization_slugs_demo_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.slug = 'demo' and not exists (select 1 from public.organizations o where o.id = new.organization_id and o.showcase) then
    raise exception 'L''adresse « demo » est réservée au vitrail de démonstration.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

CREATE FUNCTION public.organizations_demo_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if old.showcase and not new.showcase and exists (select 1 from public.organization_slugs s where s.organization_id = new.id and s.slug = 'demo') then
    raise exception 'Cet organisme porte l''adresse « demo » : il reste une démonstration.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

CREATE FUNCTION public.vitraux_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.organization_id <> old.organization_id or new.kind <> old.kind then
    raise exception 'L''organisme et le type d''un vitrail ne changent jamais';
  end if;
  if new.in_main <> old.in_main and exists (select 1 from public.donations d where d.vitrail_id = old.id) then
    raise exception 'Une campagne qui a reçu des dons ne change plus de visibilité (privée ou non)';
  end if;
  return new;
end $$;

SET default_tablespace = '';

CREATE TABLE public.access_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_name text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    message text,
    locale text DEFAULT 'fr'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    handled_at timestamp with time zone,
    outcome text,
    invitation_id uuid,
    CONSTRAINT access_requests_email_check CHECK (((email = lower(email)) AND (POSITION(('@'::text) IN (email)) > 1))),
    CONSTRAINT access_requests_locale_check CHECK ((locale = ANY (ARRAY['fr'::text, 'en'::text]))),
    CONSTRAINT access_requests_message_check CHECK ((length(message) <= 1000)),
    CONSTRAINT access_requests_name_check CHECK (((length(name) >= 2) AND (length(name) <= 80))),
    CONSTRAINT access_requests_org_name_check CHECK (((length(org_name) >= 2) AND (length(org_name) <= 120))),
    CONSTRAINT access_requests_outcome_check CHECK ((outcome = ANY (ARRAY['invited'::text, 'archived'::text])))
);

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    password_hash text,
    is_studio boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    password_changed_at timestamp with time zone,
    last_login_at timestamp with time zone,
    CONSTRAINT accounts_email_check CHECK (((email = lower(email)) AND (POSITION(('@'::text) IN (email)) > 1))),
    CONSTRAINT accounts_name_check CHECK ((length(name) <= 80))
);

CREATE TABLE public.donations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    donor_id uuid NOT NULL,
    amount_cents integer NOT NULL,
    source text NOT NULL,
    provider_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    channel text,
    fee_cents integer DEFAULT 0 NOT NULL,
    organization_id uuid NOT NULL,
    vitrail_id uuid NOT NULL,
    refunded_cents integer DEFAULT 0 NOT NULL,
    platform_fee_cents integer DEFAULT 0 NOT NULL,
    platform_fee_refunded_cents integer DEFAULT 0 NOT NULL,
    dispute_id text,
    dispute_status text,
    dispute_due_by timestamp with time zone,
    dispute_lost_cents integer DEFAULT 0 NOT NULL,
    CONSTRAINT donations_amount_cents_check CHECK ((amount_cents > 0)),
    CONSTRAINT donations_dispute_lost_cents_check CHECK ((dispute_lost_cents >= 0)),
    CONSTRAINT donations_dispute_status_check CHECK ((dispute_status = ANY (ARRAY['open'::text, 'won'::text, 'lost'::text]))),
    CONSTRAINT donations_fee_cents_check CHECK ((fee_cents >= 0)),
    CONSTRAINT donations_fee_refund_le_fee CHECK ((platform_fee_refunded_cents <= platform_fee_cents)),
    CONSTRAINT donations_platform_fee_cents_check CHECK ((platform_fee_cents >= 0)),
    CONSTRAINT donations_platform_fee_refunded_cents_check CHECK ((platform_fee_refunded_cents >= 0)),
    CONSTRAINT donations_refund_le_amount CHECK ((refunded_cents <= amount_cents)),
    CONSTRAINT donations_refunded_cents_check CHECK ((refunded_cents >= 0)),
    CONSTRAINT donations_source_check CHECK ((source = ANY (ARRAY['stripe'::text, 'cash'::text, 'seed'::text, 'demo'::text])))
);

CREATE TABLE public.donors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    display_name text DEFAULT 'Anonyme'::text NOT NULL,
    show_name boolean DEFAULT false NOT NULL,
    message text,
    photo_url text,
    color text NOT NULL,
    hidden boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    photo_status text DEFAULT 'approved'::text NOT NULL,
    message_status text DEFAULT 'approved'::text NOT NULL,
    quote_consent boolean DEFAULT false NOT NULL,
    locale text DEFAULT 'fr'::text NOT NULL,
    organization_id uuid NOT NULL,
    mailing_consent_at timestamp with time zone,
    mailing_consent_version text,
    mailing_consent_locale text,
    mailing_withdrawn_at timestamp with time zone,
    erased_at timestamp with time zone,
    CONSTRAINT donors_email_check CHECK ((email = lower(email))),
    CONSTRAINT donors_locale_check CHECK ((locale = ANY (ARRAY['fr'::text, 'en'::text]))),
    CONSTRAINT donors_mailing_consent_locale_check CHECK ((mailing_consent_locale = ANY (ARRAY['fr'::text, 'en'::text]))),
    CONSTRAINT donors_message_status_check CHECK ((message_status = ANY (ARRAY['approved'::text, 'pending'::text]))),
    CONSTRAINT donors_photo_status_check CHECK ((photo_status = ANY (ARRAY['approved'::text, 'pending'::text])))
);

CREATE VIEW public.donor_totals WITH (security_invoker='true') AS
 SELECT d.id AS donor_id,
    COALESCE(sum((n.amount_cents - n.refunded_cents)), (0)::bigint) AS total_cents,
    max(n.created_at) AS last_donation_at
   FROM (public.donors d
     LEFT JOIN public.donations n ON ((n.donor_id = d.id)))
  GROUP BY d.id;

CREATE TABLE public.edit_tokens (
    token_hash text NOT NULL,
    donor_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.email_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    donor_id uuid,
    to_email text NOT NULL,
    kind text NOT NULL,
    locale text DEFAULT 'fr'::text NOT NULL,
    subject text NOT NULL,
    provider_id text,
    status text DEFAULT 'queued'::text NOT NULL,
    error text,
    organization_id uuid,
    CONSTRAINT email_log_kind_check CHECK ((kind = ANY (ARRAY['receipt'::text, 'magic_link'::text, 'reminder'::text, 'moderation'::text, 'invitation'::text, 'password_reset'::text, 'signup_code'::text, 'access_request'::text]))),
    CONSTRAINT email_log_locale_check CHECK ((locale = ANY (ARRAY['fr'::text, 'en'::text]))),
    CONSTRAINT email_log_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'delivered'::text, 'delayed'::text, 'bounced'::text, 'complained'::text, 'failed'::text, 'skipped'::text])))
);

CREATE TABLE public.invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    organization_id uuid,
    role text NOT NULL,
    token_hash text NOT NULL,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    revoked_at timestamp with time zone,
    org_name text,
    message text,
    locale text DEFAULT 'fr'::text NOT NULL,
    CONSTRAINT invitations_email_check CHECK (((email = lower(email)) AND (POSITION(('@'::text) IN (email)) > 1))),
    CONSTRAINT invitations_locale_check CHECK ((locale = ANY (ARRAY['fr'::text, 'en'::text]))),
    CONSTRAINT invitations_message_check CHECK ((length(message) <= 1000)),
    CONSTRAINT invitations_org_name_check CHECK ((length(org_name) <= 120)),
    CONSTRAINT invitations_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'volunteer'::text])))
);

CREATE TABLE public.login_failures (
    id bigint NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.login_failures_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.login_failures_id_seq OWNED BY public.login_failures.id;

CREATE TABLE public.memberships (
    account_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT memberships_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'volunteer'::text])))
);

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    name_fr text NOT NULL,
    website_url text,
    texts jsonb DEFAULT '{}'::jsonb NOT NULL,
    theme jsonb DEFAULT '{}'::jsonb NOT NULL,
    legal jsonb DEFAULT '{}'::jsonb NOT NULL,
    logo_path text,
    locales text[] DEFAULT ARRAY['fr'::text] NOT NULL,
    photo_moderation text DEFAULT 'live'::text NOT NULL,
    sender_name text,
    reply_to text,
    stripe_account_id text,
    stripe_ready boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    fee_schedule jsonb DEFAULT '{"rate": 0.028, "tierRate": 0.005, "tierAfterCents": 500000}'::jsonb NOT NULL,
    practice_of uuid,
    terms_version text,
    terms_accepted_at timestamp with time zone,
    terms_accepted_by uuid,
    went_live_at timestamp with time zone,
    icon_path text,
    draft jsonb,
    draft_updated_at timestamp with time zone,
    published_at timestamp with time zone,
    showcase boolean DEFAULT false NOT NULL,
    CONSTRAINT organizations_locales_check CHECK ((((array_length(locales, 1) >= 1) AND (array_length(locales, 1) <= 2)) AND (locales <@ ARRAY['fr'::text, 'en'::text]))),
    CONSTRAINT organizations_photo_moderation_check CHECK ((photo_moderation = ANY (ARRAY['live'::text, 'moderation'::text]))),
    CONSTRAINT organizations_showcase_not_practice CHECK ((NOT (showcase AND (practice_of IS NOT NULL)))),
    CONSTRAINT organizations_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'live'::text, 'suspended'::text])))
);

CREATE VIEW public.organization_fee_totals WITH (security_invoker='true') AS
 SELECT o.id AS organization_id,
    COALESCE(sum((d.platform_fee_cents - d.platform_fee_refunded_cents)), (0)::bigint) AS fees_cents
   FROM (public.organizations o
     LEFT JOIN public.donations d ON ((d.organization_id = o.id)))
  GROUP BY o.id;

CREATE TABLE public.organization_slugs (
    slug text NOT NULL,
    organization_id uuid NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_slugs_platform_reserved CHECK ((slug <> ALL (ARRAY['studio'::text, 'plateforme'::text, 'inscription'::text, 'entrainement'::text, 'essai'::text, 'www2'::text]))),
    CONSTRAINT organization_slugs_slug_check CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'::text)),
    CONSTRAINT organization_slugs_slug_check1 CHECK ((slug <> ALL (ARRAY['www'::text, 'admin'::text, 'api'::text, 'app'::text, 'mail'::text, 'smtp'::text, 'ftp'::text, 'static'::text, 'assets'::text, 'cdn'::text, 'status'::text, 'help'::text, 'support'::text, 'docs'::text, 'blog'::text, 'dashboard'::text, 'login'::text, 'auth'::text, 'console'::text, 'donivers'::text, 'test'::text, 'staging'::text, 'preview'::text, 'dev'::text])))
);

CREATE TABLE public.password_resets (
    token_hash text NOT NULL,
    account_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone
);

CREATE TABLE public.reports (
    id bigint NOT NULL,
    donor_id uuid NOT NULL,
    reason text,
    resolved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid NOT NULL
);

ALTER TABLE public.reports ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE public.sessions (
    token_hash text NOT NULL,
    account_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    user_agent text
);

CREATE TABLE public.signup_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invitation_id uuid NOT NULL,
    email text NOT NULL,
    code_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    verified_at timestamp with time zone,
    CONSTRAINT signup_codes_email_check CHECK ((email = lower(email)))
);

CREATE TABLE public.visits (
    id bigint NOT NULL,
    channel text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid NOT NULL,
    vitrail_id uuid NOT NULL
);

ALTER TABLE public.visits ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.visits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE public.vitraux (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    kind text NOT NULL,
    slug text,
    name text NOT NULL,
    state text DEFAULT 'active'::text NOT NULL,
    in_main boolean DEFAULT true NOT NULL,
    goal_cents integer DEFAULT 0 NOT NULL,
    starts_on date,
    ends_on date,
    texts jsonb DEFAULT '{}'::jsonb NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vitraux_check CHECK (((kind = 'permanent'::text) = (slug IS NULL))),
    CONSTRAINT vitraux_check1 CHECK (((kind = 'campaign'::text) OR ((state = 'active'::text) AND in_main))),
    CONSTRAINT vitraux_goal_cents_check CHECK ((goal_cents >= 0)),
    CONSTRAINT vitraux_kind_check CHECK ((kind = ANY (ARRAY['permanent'::text, 'campaign'::text]))),
    CONSTRAINT vitraux_slug_check CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$'::text)),
    CONSTRAINT vitraux_state_check CHECK ((state = ANY (ARRAY['active'::text, 'closed'::text])))
);

CREATE VIEW public.vitrail_donations WITH (security_invoker='true') AS
 SELECT n.id AS donation_id,
    n.vitrail_id,
    n.organization_id,
    n.donor_id,
    (n.amount_cents - n.refunded_cents) AS net_cents,
    n.created_at
   FROM public.donations n
UNION ALL
 SELECT n.id AS donation_id,
    p.id AS vitrail_id,
    n.organization_id,
    n.donor_id,
    (n.amount_cents - n.refunded_cents) AS net_cents,
    n.created_at
   FROM ((public.donations n
     JOIN public.vitraux c ON (((c.id = n.vitrail_id) AND (c.kind = 'campaign'::text) AND c.in_main)))
     JOIN public.vitraux p ON (((p.organization_id = n.organization_id) AND (p.kind = 'permanent'::text))));

CREATE VIEW public.vitrail_donor_totals WITH (security_invoker='true') AS
 SELECT vitrail_id,
    organization_id,
    donor_id,
    sum(net_cents) AS total_cents,
    max(created_at) AS last_donation_at
   FROM public.vitrail_donations d
  GROUP BY vitrail_id, organization_id, donor_id
 HAVING (sum(net_cents) > 0);

CREATE VIEW public.vitrail_totals WITH (security_invoker='true') AS
 SELECT v.id AS vitrail_id,
    v.organization_id,
    COALESCE(sum(d.net_cents), (0)::bigint) AS total_cents,
    count(d.donation_id) FILTER (WHERE (d.net_cents > 0)) AS donations_count
   FROM (public.vitraux v
     LEFT JOIN public.vitrail_donations d ON ((d.vitrail_id = v.id)))
  GROUP BY v.id, v.organization_id;

ALTER TABLE ONLY public.login_failures ALTER COLUMN id SET DEFAULT nextval('public.login_failures_id_seq'::regclass);

ALTER TABLE ONLY public.access_requests
    ADD CONSTRAINT access_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_email_key UNIQUE (email);

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.donations
    ADD CONSTRAINT donations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.donations
    ADD CONSTRAINT donations_provider_ref_key UNIQUE (provider_ref);

ALTER TABLE ONLY public.donors
    ADD CONSTRAINT donors_id_org_key UNIQUE (id, organization_id);

ALTER TABLE ONLY public.donors
    ADD CONSTRAINT donors_org_email_key UNIQUE (organization_id, email);

ALTER TABLE ONLY public.donors
    ADD CONSTRAINT donors_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.edit_tokens
    ADD CONSTRAINT edit_tokens_pkey PRIMARY KEY (token_hash);

ALTER TABLE ONLY public.email_log
    ADD CONSTRAINT email_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.email_log
    ADD CONSTRAINT email_log_provider_id_key UNIQUE (provider_id);

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_token_hash_key UNIQUE (token_hash);

ALTER TABLE ONLY public.login_failures
    ADD CONSTRAINT login_failures_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (account_id, organization_id);

ALTER TABLE ONLY public.organization_slugs
    ADD CONSTRAINT organization_slugs_pkey PRIMARY KEY (slug);

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_practice_of_key UNIQUE (practice_of);

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_stripe_account_id_key UNIQUE (stripe_account_id);

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_pkey PRIMARY KEY (token_hash);

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (token_hash);

ALTER TABLE ONLY public.signup_codes
    ADD CONSTRAINT signup_codes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.vitraux
    ADD CONSTRAINT vitraux_id_organization_id_key UNIQUE (id, organization_id);

ALTER TABLE ONLY public.vitraux
    ADD CONSTRAINT vitraux_pkey PRIMARY KEY (id);

CREATE INDEX access_requests_open_idx ON public.access_requests USING btree (created_at DESC) WHERE (handled_at IS NULL);

CREATE INDEX donations_created_idx ON public.donations USING btree (created_at DESC);

CREATE INDEX donations_dispute_open_idx ON public.donations USING btree (organization_id) WHERE (dispute_status = 'open'::text);

CREATE INDEX donations_donor_idx ON public.donations USING btree (donor_id);

CREATE INDEX donations_vitrail_idx ON public.donations USING btree (vitrail_id);

CREATE INDEX email_log_created_idx ON public.email_log USING btree (created_at DESC);

CREATE INDEX email_log_donor_idx ON public.email_log USING btree (donor_id, kind);

CREATE INDEX email_log_org_idx ON public.email_log USING btree (organization_id, created_at DESC);

CREATE INDEX invitations_email_idx ON public.invitations USING btree (email) WHERE ((accepted_at IS NULL) AND (revoked_at IS NULL));

CREATE INDEX login_failures_email_idx ON public.login_failures USING btree (email, created_at);

CREATE INDEX memberships_org_idx ON public.memberships USING btree (organization_id);

CREATE UNIQUE INDEX organization_slugs_one_current ON public.organization_slugs USING btree (organization_id) WHERE is_current;

CREATE INDEX reports_open_idx ON public.reports USING btree (resolved, created_at DESC);

CREATE INDEX reports_org_open_idx ON public.reports USING btree (organization_id, resolved, created_at DESC);

CREATE INDEX sessions_account_idx ON public.sessions USING btree (account_id);

CREATE INDEX signup_codes_invitation_idx ON public.signup_codes USING btree (invitation_id, created_at DESC);

CREATE INDEX visits_channel_idx ON public.visits USING btree (channel);

CREATE INDEX visits_vitrail_idx ON public.visits USING btree (vitrail_id, channel);

CREATE UNIQUE INDEX vitraux_one_permanent ON public.vitraux USING btree (organization_id) WHERE (kind = 'permanent'::text);

CREATE UNIQUE INDEX vitraux_slug_per_org ON public.vitraux USING btree (organization_id, slug) WHERE (slug IS NOT NULL);

CREATE TRIGGER donations_guard BEFORE UPDATE ON public.donations FOR EACH ROW EXECUTE FUNCTION public.donations_guard();

CREATE TRIGGER organization_slugs_demo_guard BEFORE INSERT OR UPDATE OF slug, organization_id ON public.organization_slugs FOR EACH ROW EXECUTE FUNCTION public.organization_slugs_demo_guard();

CREATE TRIGGER organizations_demo_guard BEFORE UPDATE OF showcase ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.organizations_demo_guard();

CREATE TRIGGER vitraux_guard BEFORE UPDATE ON public.vitraux FOR EACH ROW EXECUTE FUNCTION public.vitraux_guard();

ALTER TABLE ONLY public.access_requests
    ADD CONSTRAINT access_requests_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES public.invitations(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.donations
    ADD CONSTRAINT donations_donor_id_fkey FOREIGN KEY (donor_id) REFERENCES public.donors(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.donations
    ADD CONSTRAINT donations_donor_org_fk FOREIGN KEY (donor_id, organization_id) REFERENCES public.donors(id, organization_id);

ALTER TABLE ONLY public.donations
    ADD CONSTRAINT donations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.donations
    ADD CONSTRAINT donations_vitrail_org_fk FOREIGN KEY (vitrail_id, organization_id) REFERENCES public.vitraux(id, organization_id);

ALTER TABLE ONLY public.donors
    ADD CONSTRAINT donors_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.edit_tokens
    ADD CONSTRAINT edit_tokens_donor_id_fkey FOREIGN KEY (donor_id) REFERENCES public.donors(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_log
    ADD CONSTRAINT email_log_donor_org_fk FOREIGN KEY (donor_id, organization_id) REFERENCES public.donors(id, organization_id) ON DELETE SET NULL (donor_id);

ALTER TABLE ONLY public.email_log
    ADD CONSTRAINT email_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.accounts(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.organization_slugs
    ADD CONSTRAINT organization_slugs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_practice_of_fkey FOREIGN KEY (practice_of) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_terms_accepted_by_fkey FOREIGN KEY (terms_accepted_by) REFERENCES public.accounts(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_donor_id_fkey FOREIGN KEY (donor_id) REFERENCES public.donors(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_donor_org_fk FOREIGN KEY (donor_id, organization_id) REFERENCES public.donors(id, organization_id);

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.signup_codes
    ADD CONSTRAINT signup_codes_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES public.invitations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_vitrail_org_fk FOREIGN KEY (vitrail_id, organization_id) REFERENCES public.vitraux(id, organization_id);

ALTER TABLE ONLY public.vitraux
    ADD CONSTRAINT vitraux_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.donors ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.edit_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.login_failures ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organization_slugs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.signup_codes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vitraux ENABLE ROW LEVEL SECURITY;

--

--


-- ── Accès : serveur seulement (service_role) ──────────────────────────────────────────────────────────────────────────────
-- Supabase accorde par défaut tous les droits à anon et authenticated sur ce qui est créé dans « public » : on les retire.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- ── Photos des donateurs et logos des organismes (org/<id>/…) ──────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 1048576, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;
