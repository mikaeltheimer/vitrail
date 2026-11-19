-- Donivers — schéma complet de la base (état au 2026-11-17 : migrations jusqu'à 2026-12-01-changement-courriel.sql comprise ;
-- la 19 et la 30 ne touchent que des données ; la 23 n'existe pas). Migration 31 (2026-12-01) : pg_dump d'une base construite
-- avec ce fichier, comparé à celui de la même base après la migration (table email_changes, sa clé, son index, sa clé
-- étrangère et sa RLS ; contrainte email_log_kind_check élargie). Migrations 28 et 29 : pg_dump d'une base construite avec ce
-- fichier, comparé à celui de la même base après les deux migrations (table terms_acceptances, colonne
-- fee_threshold_notified_at, contrainte email_log_kind_check élargie, studio_tax_totals et studio_suggestion_stats, ces
-- deux dernières à la fin avec studio_org_stats). Avant : mis à jour par pg_dump d'une base construite avec ce fichier
-- puis la migration 27 (comparaison des deux pg_dump : platform_settings et son historique, les colonnes de organizations
-- et de donations, la vue organization_billing, settle_platform_fee et studio_org_stats ; une base construite avec ce
-- fichier seul donne le même pg_dump, aux droits explicites de service_role près, que Supabase accorde par défaut).
-- La vue organization_billing suit la table vitraux, et studio_org_stats reste à la fin : le corps d'une fonction SQL
-- est vérifié à sa création. Les deux lignes de départ de platform_settings sont insérées en fin de fichier.
-- Dernier rejeu complet (11 nov.) : schema.sql d'avant l'étape 3 (cd7c01d), puis toutes les migrations
-- à partir de 2026-11-06, dans l'ordre de leur nom.
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

CREATE FUNCTION public.change_org_slug(p_org uuid, p_slug text, p_max integer) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_org record;
  v_draft boolean;
  v_practice uuid;
  v_holder uuid;
  v_used integer;
  v_target record;
  v_slug text;
  v_n integer;
begin
  select id, status, went_live_at, practice_of, showcase into v_org from public.organizations where id = p_org for update;
  if not found or v_org.practice_of is not null or v_org.showcase or v_org.status = 'suspended' then
    return 'impossible';
  end if;
  v_draft := v_org.went_live_at is null;

  if exists (select 1 from public.organization_slugs s where s.organization_id = p_org and s.is_current and s.slug = p_slug) then
    return 'meme';
  end if;

  select id into v_practice from public.organizations where practice_of = p_org limit 1;

  select organization_id into v_holder from public.organization_slugs where slug = p_slug;
  if v_holder is not null and v_holder <> p_org then
    return 'pris';
  end if;
  if exists (select 1 from public.organization_slugs s where s.slug = p_slug || '--essai' and s.organization_id is distinct from v_practice) then
    return 'pris';
  end if;

  -- Nouvelle adresse après la mise en ligne : limitée (un retour à une ancienne adresse ne compte pas)
  if not v_draft and v_holder is null then
    select count(*) into v_used from public.organization_slugs s where s.organization_id = p_org and s.created_at > v_org.went_live_at;
    if v_used >= p_max then
      return 'limite';
    end if;
  end if;

  -- L'organisme, puis son atelier
  for v_target in
    select p_org as id, p_slug as slug
    union all
    select v_practice, p_slug || '--essai' where v_practice is not null
  loop
    update public.organization_slugs set is_current = false where organization_id = v_target.id and is_current;
    if v_draft then
      delete from public.organization_slugs where organization_id = v_target.id and not is_current;
    end if;
    v_slug := v_target.slug;
    insert into public.organization_slugs (slug, organization_id, is_current, created_at)
      values (v_slug, v_target.id, true, now())
      on conflict (slug) do update set is_current = true where public.organization_slugs.organization_id = v_target.id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      -- Prise entre-temps par un autre organisme : tout est annulé
      raise exception 'Adresse déjà prise : %', v_slug using errcode = 'unique_violation';
    end if;
  end loop;

  return 'ok';
end $$;

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

CREATE FUNCTION public.platform_settings_log() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if tg_when = 'BEFORE' then
    new.updated_at := now();
    return new;
  end if;
  if tg_op = 'UPDATE' and new.value is not distinct from old.value then
    return null;
  end if;
  insert into public.platform_settings_history (key, old_value, new_value, changed_by)
  values (new.key, case when tg_op = 'UPDATE' then old.value end, new.value, new.updated_by);
  return null;
end;
$$;

CREATE FUNCTION public.settle_platform_fee(p_donation uuid, p_stripe_fee_actual integer DEFAULT NULL::integer) RETURNS TABLE(waived_cents integer, surplus_cents integer, settled_now boolean, already_settled boolean)
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_org uuid;
  d record;
  o record;
  v_model text;
  v_cap bigint;
  v_free bigint;
  v_counts boolean;
  v_principal boolean;
  v_s integer;
  v_p_charged integer;
  v_p_allowed integer;
  v_cumul bigint := 0;
  v_waived integer;
  v_donors bigint;
  v_settled_now boolean := false;
begin
  select organization_id into v_org from public.donations where id = p_donation;
  if v_org is null then
    raise exception 'Don inconnu : %', p_donation using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('donivers-platform-fee:' || v_org::text, 0));

  select dn.id, dn.source, dn.vitrail_id, dn.platform_fee_cents, dn.platform_fee_waived_cents, dn.platform_fee_settled_at,
         dn.platform_fee_refunded_cents, dn.donor_contribution_cents, dn.contribution_surplus_cents, dn.stripe_fee_actual_cents
    into d from public.donations dn where dn.id = p_donation for update;
  if d.platform_fee_settled_at is not null then
    -- Frais réels arrivés après le règlement (charge.updated : Stripe crée la balance transaction de façon asynchrone) :
    -- on corrige le surplus une seule fois ; la différence s'ajoute à l'excédent rendu
    if p_stripe_fee_actual is not null and d.stripe_fee_actual_cents is null then
      v_s := least(d.contribution_surplus_cents, greatest(0, d.donor_contribution_cents - p_stripe_fee_actual));
      v_waived := least(d.platform_fee_cents - d.platform_fee_refunded_cents, d.platform_fee_waived_cents + (d.contribution_surplus_cents - v_s));
      update public.donations
         set contribution_surplus_cents = v_s, platform_fee_waived_cents = v_waived, stripe_fee_actual_cents = p_stripe_fee_actual
       where id = p_donation;
      return query select v_waived, v_s, false, true;
      return;
    end if;
    return query select d.platform_fee_waived_cents, d.contribution_surplus_cents, false, true;
    return;
  end if;

  select og.fee_schedule, og.fee_settled_at, og.fee_threshold_reached_at into o
    from public.organizations og where og.id = v_org for update;
  v_model := coalesce(o.fee_schedule->>'model', 'capped');
  v_cap := coalesce(case when jsonb_typeof(o.fee_schedule->'capCents') = 'number' then (o.fee_schedule->>'capCents')::bigint end, 49500);
  v_free := coalesce(case when jsonb_typeof(o.fee_schedule->'freeDonors') = 'number' then (o.fee_schedule->>'freeDonors')::bigint end, 100);
  v_counts := coalesce(case when jsonb_typeof(o.fee_schedule->'contributionCountsTowardCap') = 'boolean'
                then (o.fee_schedule->>'contributionCountsTowardCap')::boolean end, true);
  select v.kind = 'permanent' into v_principal from public.vitraux v where v.id = d.vitrail_id;

  -- Surplus réel : jamais plus que l'estimé (Stripe ne permet pas d'augmenter la commission après coup)
  v_s := d.contribution_surplus_cents;
  if p_stripe_fee_actual is not null then
    v_s := least(v_s, greatest(0, d.donor_contribution_cents - p_stripe_fee_actual));
  end if;
  v_p_charged := greatest(0, d.platform_fee_cents - d.contribution_surplus_cents);

  if d.source <> 'stripe' or not coalesce(v_principal, false) then
    v_p_allowed := v_p_charged; -- hors du vitrail principal : rien à corriger ici (campagnes : étape L2)
  elsif v_model = 'exempt' or o.fee_settled_at is not null then
    v_p_allowed := 0;
  else
    -- Cumul des autres dons déjà réglés (même définition que organization_billing), ce don exclu
    select coalesce(sum(case when v_counts
             then x.platform_fee_cents - x.platform_fee_waived_cents - x.platform_fee_refunded_cents
             else x.platform_fee_cents - x.platform_fee_waived_cents - x.platform_fee_refunded_cents
                  - case when x.platform_fee_cents - x.platform_fee_waived_cents > 0
                      then round(x.contribution_surplus_cents::numeric * (x.platform_fee_cents - x.platform_fee_waived_cents - x.platform_fee_refunded_cents)
                                 / (x.platform_fee_cents - x.platform_fee_waived_cents))::bigint
                      else 0 end
             end), 0)
      into v_cumul
      from public.donations x
      join public.vitraux v on v.id = x.vitrail_id and v.kind = 'permanent'
      where x.organization_id = v_org and x.source = 'stripe' and x.id <> p_donation and x.platform_fee_settled_at is not null;
    v_p_allowed := least(v_p_charged, greatest(0, v_cap - v_cumul - case when v_counts then v_s else 0 end))::integer;
  end if;

  v_waived := (v_p_charged - v_p_allowed) + (d.contribution_surplus_cents - v_s);

  update public.donations
     set platform_fee_waived_cents = v_waived,
         contribution_surplus_cents = v_s,
         stripe_fee_actual_cents = coalesce(p_stripe_fee_actual, stripe_fee_actual_cents),
         platform_fee_settled_at = now()
   where id = p_donation;

  -- Verrous (jamais retirés)
  if d.source = 'stripe' and coalesce(v_principal, false) and v_model <> 'exempt' and o.fee_settled_at is null
     and v_cumul + (case when v_counts then v_s else 0 end) + v_p_allowed >= v_cap then
    update public.organizations set fee_settled_at = now() where id = v_org and fee_settled_at is null;
    v_settled_now := found;
  end if;
  if o.fee_threshold_reached_at is null then
    select count(distinct dn.donor_id) into v_donors from public.donations dn
      where dn.organization_id = v_org and dn.source in ('stripe', 'cash', 'seed');
    if v_donors >= v_free then
      update public.organizations set fee_threshold_reached_at = now() where id = v_org and fee_threshold_reached_at is null;
    end if;
  end if;

  return query select v_waived, v_s, v_settled_now, false;
end;
$$;

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
    source text,
    CONSTRAINT access_requests_email_check CHECK (((email = lower(email)) AND (POSITION(('@'::text) IN (email)) > 1))),
    CONSTRAINT access_requests_locale_check CHECK ((locale = ANY (ARRAY['fr'::text, 'en'::text]))),
    CONSTRAINT access_requests_message_check CHECK ((length(message) <= 1000)),
    CONSTRAINT access_requests_name_check CHECK (((length(name) >= 2) AND (length(name) <= 80))),
    CONSTRAINT access_requests_org_name_check CHECK (((length(org_name) >= 2) AND (length(org_name) <= 120))),
    CONSTRAINT access_requests_outcome_check CHECK ((outcome = ANY (ARRAY['invited'::text, 'archived'::text]))),
    CONSTRAINT access_requests_source_check CHECK ((source ~ '^[a-z0-9][a-z0-9-]{0,39}$'::text))
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

CREATE TABLE public.demo_screen_pieces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    screen_code text NOT NULL,
    name text,
    message text,
    question text,
    color text NOT NULL,
    amount_cents integer NOT NULL,
    photo text,
    has_photo boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT demo_screen_pieces_amount_cents_check CHECK ((amount_cents > 0)),
    CONSTRAINT demo_screen_pieces_color_check CHECK ((char_length(color) <= 40)),
    CONSTRAINT demo_screen_pieces_message_check CHECK ((char_length(message) <= 1000)),
    CONSTRAINT demo_screen_pieces_name_check CHECK ((char_length(name) <= 60)),
    CONSTRAINT demo_screen_pieces_photo_check CHECK (((char_length(photo) <= 1000000) AND (photo ~~ 'data:image/jpeg;base64,%'::text))),
    CONSTRAINT demo_screen_pieces_photo_flag CHECK ((has_photo = (photo IS NOT NULL))),
    CONSTRAINT demo_screen_pieces_question_check CHECK ((char_length(question) <= 300)),
    CONSTRAINT demo_screen_pieces_screen_code_check CHECK ((screen_code ~ '^[a-z0-9]{12}$'::text))
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
    donor_contribution_cents integer DEFAULT 0 NOT NULL,
    contribution_suggested_cents integer,
    contribution_brackets_version text,
    stripe_fee_estimated_cents integer,
    stripe_fee_actual_cents integer,
    contribution_surplus_cents integer DEFAULT 0 NOT NULL,
    tax_province text,
    tax_included_cents integer DEFAULT 0 NOT NULL,
    platform_fee_waived_cents integer DEFAULT 0 NOT NULL,
    platform_fee_settled_at timestamp with time zone,
    CONSTRAINT donations_amount_cents_check CHECK ((amount_cents > 0)),
    CONSTRAINT donations_contribution_checks CHECK (((donor_contribution_cents >= 0) AND ((contribution_suggested_cents IS NULL) OR (contribution_suggested_cents >= 0)) AND ((stripe_fee_estimated_cents IS NULL) OR (stripe_fee_estimated_cents >= 0)) AND ((stripe_fee_actual_cents IS NULL) OR (stripe_fee_actual_cents >= 0)) AND (contribution_surplus_cents >= 0) AND (tax_included_cents >= 0) AND (platform_fee_waived_cents >= 0))),
    CONSTRAINT donations_dispute_lost_cents_check CHECK ((dispute_lost_cents >= 0)),
    CONSTRAINT donations_dispute_status_check CHECK ((dispute_status = ANY (ARRAY['open'::text, 'won'::text, 'lost'::text]))),
    CONSTRAINT donations_fee_cents_check CHECK ((fee_cents >= 0)),
    CONSTRAINT donations_fee_refund_le_fee CHECK ((platform_fee_refunded_cents <= platform_fee_cents)),
    CONSTRAINT donations_platform_fee_balance CHECK ((((platform_fee_refunded_cents + platform_fee_waived_cents) <= platform_fee_cents) AND (contribution_surplus_cents <= platform_fee_cents) AND (tax_included_cents <= platform_fee_cents))),
    CONSTRAINT donations_platform_fee_cents_check CHECK ((platform_fee_cents >= 0)),
    CONSTRAINT donations_platform_fee_refunded_cents_check CHECK ((platform_fee_refunded_cents >= 0)),
    CONSTRAINT donations_refund_le_amount CHECK ((refunded_cents <= amount_cents)),
    CONSTRAINT donations_refunded_cents_check CHECK ((refunded_cents >= 0)),
    CONSTRAINT donations_source_check CHECK ((source = ANY (ARRAY['stripe'::text, 'cash'::text, 'seed'::text, 'demo'::text]))),
    CONSTRAINT donations_tax_province_check CHECK (((tax_province IS NULL) OR (tax_province = ANY (ARRAY['AB'::text, 'BC'::text, 'MB'::text, 'NB'::text, 'NL'::text, 'NS'::text, 'NT'::text, 'NU'::text, 'ON'::text, 'PE'::text, 'QC'::text, 'SK'::text, 'YT'::text]))))
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
    message_question text,
    quote_consent_at timestamp with time zone,
    quote_withdrawn_at timestamp with time zone,
    CONSTRAINT donors_email_check CHECK ((email = lower(email))),
    CONSTRAINT donors_locale_check CHECK ((locale = ANY (ARRAY['fr'::text, 'en'::text]))),
    CONSTRAINT donors_mailing_consent_locale_check CHECK ((mailing_consent_locale = ANY (ARRAY['fr'::text, 'en'::text]))),
    CONSTRAINT donors_message_question_check CHECK ((char_length(message_question) <= 120)),
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

CREATE TABLE public.email_changes (
    token_hash text NOT NULL,
    account_id uuid NOT NULL,
    old_email text NOT NULL,
    new_email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    CONSTRAINT email_changes_new_email_check CHECK (((new_email = lower(new_email)) AND (POSITION(('@'::text) IN (new_email)) > 1)))
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
    CONSTRAINT email_log_kind_check CHECK ((kind = ANY (ARRAY['receipt'::text, 'magic_link'::text, 'reminder'::text, 'moderation'::text, 'invitation'::text, 'password_reset'::text, 'signup_code'::text, 'access_request'::text, 'fee_threshold'::text, 'email_change'::text, 'email_changed'::text]))),
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
    fee_threshold_reached_at timestamp with time zone,
    fee_settled_at timestamp with time zone,
    tax_province text,
    fee_threshold_notified_at timestamp with time zone,
    CONSTRAINT organizations_locales_check CHECK (((array_length(locales, 1) >= 1) AND (array_length(locales, 1) <= 2) AND (locales <@ ARRAY['fr'::text, 'en'::text]))),
    CONSTRAINT organizations_photo_moderation_check CHECK ((photo_moderation = ANY (ARRAY['live'::text, 'moderation'::text]))),
    CONSTRAINT organizations_showcase_not_practice CHECK ((NOT (showcase AND (practice_of IS NOT NULL)))),
    CONSTRAINT organizations_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'live'::text, 'suspended'::text]))),
    CONSTRAINT organizations_tax_province_check CHECK (((tax_province IS NULL) OR (tax_province = ANY (ARRAY['AB'::text, 'BC'::text, 'MB'::text, 'NB'::text, 'NL'::text, 'NS'::text, 'NT'::text, 'NU'::text, 'ON'::text, 'PE'::text, 'QC'::text, 'SK'::text, 'YT'::text]))))
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

CREATE TABLE public.platform_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT platform_settings_key_check CHECK ((key ~ '^[a-z_]{1,60}$'::text))
);

CREATE TABLE public.platform_settings_history (
    id bigint NOT NULL,
    key text NOT NULL,
    old_value jsonb,
    new_value jsonb NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    changed_by uuid
);

ALTER TABLE public.platform_settings_history ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.platform_settings_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
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

CREATE TABLE public.terms_acceptances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    version text NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_by uuid,
    CONSTRAINT terms_acceptances_version_check CHECK (((char_length(version) >= 1) AND (char_length(version) <= 60)))
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
    show_total boolean DEFAULT true NOT NULL,
    CONSTRAINT vitraux_check CHECK (((kind = 'permanent'::text) = (slug IS NULL))),
    CONSTRAINT vitraux_check1 CHECK (((kind = 'campaign'::text) OR ((state = 'active'::text) AND in_main))),
    CONSTRAINT vitraux_goal_cents_check CHECK ((goal_cents >= 0)),
    CONSTRAINT vitraux_kind_check CHECK ((kind = ANY (ARRAY['permanent'::text, 'campaign'::text]))),
    CONSTRAINT vitraux_slug_check CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$'::text)),
    CONSTRAINT vitraux_state_check CHECK ((state = ANY (ARRAY['active'::text, 'closed'::text])))
);

CREATE VIEW public.organization_billing WITH (security_invoker='true') AS
 WITH dons AS (
         SELECT d.organization_id,
            ((d.platform_fee_cents - d.platform_fee_waived_cents) - d.platform_fee_refunded_cents) AS retained,
                CASE
                    WHEN ((d.platform_fee_cents - d.platform_fee_waived_cents) > 0) THEN (round((((d.contribution_surplus_cents)::numeric * (((d.platform_fee_cents - d.platform_fee_waived_cents) - d.platform_fee_refunded_cents))::numeric) / ((d.platform_fee_cents - d.platform_fee_waived_cents))::numeric)))::bigint
                    ELSE (0)::bigint
                END AS donor_part
           FROM (public.donations d
             JOIN public.vitraux v ON (((v.id = d.vitrail_id) AND (v.kind = 'permanent'::text))))
          WHERE ((d.source = 'stripe'::text) AND (d.platform_fee_settled_at IS NOT NULL))
        ), totaux AS (
         SELECT dons.organization_id,
            COALESCE(sum(dons.retained), (0)::bigint) AS retained_cents,
            (COALESCE(sum(dons.donor_part), (0)::numeric))::bigint AS donor_covered_cents
           FROM dons
          GROUP BY dons.organization_id
        ), donateurs AS (
         SELECT d.organization_id,
            count(DISTINCT d.donor_id) AS donors_counted
           FROM public.donations d
          WHERE (d.source = ANY (ARRAY['stripe'::text, 'cash'::text, 'seed'::text]))
          GROUP BY d.organization_id
        )
 SELECT o.id AS organization_id,
    COALESCE((o.fee_schedule ->> 'model'::text), 'capped'::text) AS fee_model,
    COALESCE(
        CASE
            WHEN (jsonb_typeof((o.fee_schedule -> 'freeDonors'::text)) = 'number'::text) THEN ((o.fee_schedule ->> 'freeDonors'::text))::integer
            ELSE NULL::integer
        END, 100) AS free_donors,
    COALESCE(
        CASE
            WHEN (jsonb_typeof((o.fee_schedule -> 'capCents'::text)) = 'number'::text) THEN ((o.fee_schedule ->> 'capCents'::text))::integer
            ELSE NULL::integer
        END, 49500) AS cap_cents,
    COALESCE(
        CASE
            WHEN (jsonb_typeof((o.fee_schedule -> 'contributionCountsTowardCap'::text)) = 'boolean'::text) THEN ((o.fee_schedule ->> 'contributionCountsTowardCap'::text))::boolean
            ELSE NULL::boolean
        END, true) AS contribution_counts_toward_cap,
    COALESCE(dn.donors_counted, (0)::bigint) AS donors_counted,
    (COALESCE(t.retained_cents, (0)::bigint) - COALESCE(t.donor_covered_cents, (0)::bigint)) AS fees_net_cents,
    COALESCE(t.donor_covered_cents, (0)::bigint) AS donor_covered_cents,
        CASE
            WHEN COALESCE(
            CASE
                WHEN (jsonb_typeof((o.fee_schedule -> 'contributionCountsTowardCap'::text)) = 'boolean'::text) THEN ((o.fee_schedule ->> 'contributionCountsTowardCap'::text))::boolean
                ELSE NULL::boolean
            END, true) THEN COALESCE(t.retained_cents, (0)::bigint)
            ELSE (COALESCE(t.retained_cents, (0)::bigint) - COALESCE(t.donor_covered_cents, (0)::bigint))
        END AS cumul_cents,
    o.fee_threshold_reached_at,
    o.fee_settled_at
   FROM ((public.organizations o
     LEFT JOIN totaux t ON ((t.organization_id = o.id)))
     LEFT JOIN donateurs dn ON ((dn.organization_id = o.id)));

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

ALTER TABLE ONLY public.demo_screen_pieces
    ADD CONSTRAINT demo_screen_pieces_pkey PRIMARY KEY (id);

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

ALTER TABLE ONLY public.email_changes
    ADD CONSTRAINT email_changes_pkey PRIMARY KEY (token_hash);

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

ALTER TABLE ONLY public.platform_settings_history
    ADD CONSTRAINT platform_settings_history_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (token_hash);

ALTER TABLE ONLY public.signup_codes
    ADD CONSTRAINT signup_codes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.terms_acceptances
    ADD CONSTRAINT terms_acceptances_org_version UNIQUE (organization_id, version);

ALTER TABLE ONLY public.terms_acceptances
    ADD CONSTRAINT terms_acceptances_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.vitraux
    ADD CONSTRAINT vitraux_id_organization_id_key UNIQUE (id, organization_id);

ALTER TABLE ONLY public.vitraux
    ADD CONSTRAINT vitraux_pkey PRIMARY KEY (id);

CREATE INDEX access_requests_open_idx ON public.access_requests USING btree (created_at DESC) WHERE (handled_at IS NULL);

CREATE INDEX demo_screen_pieces_created ON public.demo_screen_pieces USING btree (created_at);

CREATE INDEX demo_screen_pieces_screen ON public.demo_screen_pieces USING btree (organization_id, screen_code, created_at);

CREATE INDEX donations_created_idx ON public.donations USING btree (created_at DESC);

CREATE INDEX donations_dispute_open_idx ON public.donations USING btree (organization_id) WHERE (dispute_status = 'open'::text);

CREATE INDEX donations_donor_idx ON public.donations USING btree (donor_id);

CREATE INDEX donations_vitrail_idx ON public.donations USING btree (vitrail_id);

CREATE INDEX email_changes_account_id_idx ON public.email_changes USING btree (account_id);

CREATE INDEX email_log_created_idx ON public.email_log USING btree (created_at DESC);

CREATE INDEX email_log_donor_idx ON public.email_log USING btree (donor_id, kind);

CREATE INDEX email_log_org_idx ON public.email_log USING btree (organization_id, created_at DESC);

CREATE INDEX invitations_email_idx ON public.invitations USING btree (email) WHERE ((accepted_at IS NULL) AND (revoked_at IS NULL));

CREATE INDEX login_failures_email_idx ON public.login_failures USING btree (email, created_at);

CREATE INDEX memberships_org_idx ON public.memberships USING btree (organization_id);

CREATE UNIQUE INDEX organization_slugs_one_current ON public.organization_slugs USING btree (organization_id) WHERE is_current;

CREATE INDEX platform_settings_history_key ON public.platform_settings_history USING btree (key, changed_at);

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

CREATE TRIGGER platform_settings_log AFTER INSERT OR UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.platform_settings_log();

CREATE TRIGGER platform_settings_touch BEFORE UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.platform_settings_log();

CREATE TRIGGER vitraux_guard BEFORE UPDATE ON public.vitraux FOR EACH ROW EXECUTE FUNCTION public.vitraux_guard();

ALTER TABLE ONLY public.access_requests
    ADD CONSTRAINT access_requests_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES public.invitations(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.demo_screen_pieces
    ADD CONSTRAINT demo_screen_pieces_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

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

ALTER TABLE ONLY public.email_changes
    ADD CONSTRAINT email_changes_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;

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

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.accounts(id) ON DELETE SET NULL;

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

ALTER TABLE ONLY public.terms_acceptances
    ADD CONSTRAINT terms_acceptances_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES public.accounts(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.terms_acceptances
    ADD CONSTRAINT terms_acceptances_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_vitrail_org_fk FOREIGN KEY (vitrail_id, organization_id) REFERENCES public.vitraux(id, organization_id);

ALTER TABLE ONLY public.vitraux
    ADD CONSTRAINT vitraux_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.demo_screen_pieces ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.donors ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.edit_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_changes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.login_failures ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organization_slugs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.platform_settings_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.signup_codes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vitraux ENABLE ROW LEVEL SECURITY;

--

--


-- Après les tables : le corps de cette fonction SQL est vérifié à sa création.
CREATE FUNCTION public.studio_org_stats(p_since timestamp with time zone) RETURNS TABLE(organization_id uuid, donors bigint, donors_since bigint, donations bigint, donations_since bigint, net_cents bigint, net_since_cents bigint, offline_net_cents bigint, fee_cents bigint, fee_since_cents bigint, disputes_open bigint, last_donation_at timestamp with time zone, owners bigint, volunteers bigint, last_login_at timestamp with time zone, bounces bigint, bounces_since bigint, complaints bigint, complaints_since bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with orgs as (
    select o.id from public.organizations o where o.practice_of is null and not o.showcase
  ),
  d as (
    select
      d.organization_id,
      d.donor_id,
      d.created_at,
      d.source,
      d.dispute_status,
      greatest(d.amount_cents - d.refunded_cents - d.dispute_lost_cents, 0)::bigint as net,
      (d.platform_fee_cents - d.platform_fee_waived_cents - d.platform_fee_refunded_cents)::bigint as fee
    from public.donations d
    join orgs on orgs.id = d.organization_id
    where d.source in ('stripe', 'cash', 'seed')
  ),
  dons as (
    select
      d.organization_id,
      count(*) as donations,
      count(*) filter (where d.created_at > p_since) as donations_since,
      coalesce(sum(d.net), 0)::bigint as net_cents,
      coalesce(sum(d.net) filter (where d.created_at > p_since), 0)::bigint as net_since_cents,
      coalesce(sum(d.net) filter (where d.source in ('cash', 'seed')), 0)::bigint as offline_net_cents,
      coalesce(sum(d.fee), 0)::bigint as fee_cents,
      coalesce(sum(d.fee) filter (where d.created_at > p_since), 0)::bigint as fee_since_cents,
      count(*) filter (where d.dispute_status = 'open') as disputes_open,
      max(d.created_at) as last_donation_at
    from d
    group by d.organization_id
  ),
  -- Nouveaux donateurs de la fenêtre : premier don compté postérieur à p_since
  premiers as (
    select d.organization_id, count(*) as donors_since
    from (select d.organization_id, d.donor_id, min(d.created_at) as first_at from d group by d.organization_id, d.donor_id) d
    where d.first_at > p_since
    group by d.organization_id
  ),
  membres as (
    select
      m.organization_id,
      count(*) filter (where m.role = 'owner') as owners,
      count(*) filter (where m.role = 'volunteer') as volunteers,
      max(a.last_login_at) as last_login_at
    from public.memberships m
    join orgs on orgs.id = m.organization_id
    join public.accounts a on a.id = m.account_id
    group by m.organization_id
  ),
  courriels as (
    select
      e.organization_id,
      count(*) filter (where e.status = 'bounced') as bounces,
      count(*) filter (where e.status = 'bounced' and e.updated_at > p_since) as bounces_since,
      count(*) filter (where e.status = 'complained') as complaints,
      count(*) filter (where e.status = 'complained' and e.updated_at > p_since) as complaints_since
    from public.email_log e
    join orgs on orgs.id = e.organization_id
    where e.status in ('bounced', 'complained')
    group by e.organization_id
  )
  select
    orgs.id,
    coalesce(b.donors_counted, 0),
    coalesce(premiers.donors_since, 0),
    coalesce(dons.donations, 0),
    coalesce(dons.donations_since, 0),
    coalesce(dons.net_cents, 0),
    coalesce(dons.net_since_cents, 0),
    coalesce(dons.offline_net_cents, 0),
    coalesce(dons.fee_cents, 0),
    coalesce(dons.fee_since_cents, 0),
    coalesce(dons.disputes_open, 0),
    dons.last_donation_at,
    coalesce(membres.owners, 0),
    coalesce(membres.volunteers, 0),
    membres.last_login_at,
    coalesce(courriels.bounces, 0),
    coalesce(courriels.bounces_since, 0),
    coalesce(courriels.complaints, 0),
    coalesce(courriels.complaints_since, 0)
  from orgs
  left join public.organization_billing b on b.organization_id = orgs.id
  left join dons on dons.organization_id = orgs.id
  left join premiers on premiers.organization_id = orgs.id
  left join membres on membres.organization_id = orgs.id
  left join courriels on courriels.organization_id = orgs.id
$$;

CREATE FUNCTION public.studio_suggestion_stats(p_since timestamp with time zone) RETURNS TABLE(tranche text, donations bigint, accepted bigint, nothing bigint, donations_since bigint, accepted_since bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with d as (
    select
      case when x.amount_cents < 25000 then 'moins-250' when x.amount_cents <= 100000 then '250-1000' else 'plus-1000' end as tranche,
      x.donor_contribution_cents = x.contribution_suggested_cents as accepted,
      x.donor_contribution_cents = 0 as nothing,
      x.created_at
    from public.donations x
    join public.organizations o on o.id = x.organization_id and o.practice_of is null and not o.showcase
    where x.source = 'stripe' and coalesce(x.contribution_suggested_cents, 0) > 0
  )
  select tranche,
         count(*)::bigint,
         count(*) filter (where accepted)::bigint,
         count(*) filter (where nothing)::bigint,
         count(*) filter (where created_at >= p_since)::bigint,
         count(*) filter (where accepted and created_at >= p_since)::bigint
  from d
  group by tranche
$$;

CREATE FUNCTION public.studio_tax_totals(p_since timestamp with time zone) RETURNS TABLE(tax_province text, tax_cents bigint, tax_since_cents bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with d as (
    select
      x.tax_province,
      x.created_at,
      case when x.platform_fee_cents - x.platform_fee_waived_cents > 0
        then round(x.tax_included_cents::numeric
                   * greatest(0, x.platform_fee_cents - x.platform_fee_waived_cents - x.platform_fee_refunded_cents)
                   / (x.platform_fee_cents - x.platform_fee_waived_cents))::bigint
        else 0 end as tax_net
    from public.donations x
    join public.organizations o on o.id = x.organization_id and o.practice_of is null and not o.showcase
    where x.source = 'stripe' and x.platform_fee_settled_at is not null and x.tax_province is not null
  )
  select tax_province,
         coalesce(sum(tax_net), 0)::bigint,
         coalesce(sum(tax_net) filter (where created_at >= p_since), 0)::bigint
  from d
  group by tax_province
  order by tax_province
$$;

-- ── Accès : serveur seulement (service_role) ──────────────────────────────────────────────────────────────────────────────
-- Supabase accorde par défaut tous les droits à anon et authenticated sur ce qui est créé dans « public » : on les retire.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- ── Réglages de la plateforme : valeurs de départ (tranches de la contribution, frais Stripe estimés, taxes) ───────────
insert into public.platform_settings (key, value) values
  ('contribution_brackets', '{
     "version": "2026-11-17",
     "brackets": [{"upToCents": 25000, "rate": 0.15}, {"upToCents": 100000, "rate": 0.08}, {"rate": 0.07}],
     "menuRates": [0.10, 0.15],
     "stripeFeeEstimate": {"rate": 0.029, "fixedCents": 30}
   }'::jsonb),
  -- À confirmer avec le comptable (lib/tax.ts) : TPS + TVQ au Québec, TVH dans les provinces harmonisées, TPS ailleurs
  ('tax_rates', '{"AB": 0.05, "BC": 0.05, "MB": 0.05, "NB": 0.15, "NL": 0.15, "NS": 0.14, "NT": 0.05, "NU": 0.05,
                  "ON": 0.13, "PE": 0.15, "QC": 0.14975, "SK": 0.05, "YT": 0.05}'::jsonb)
on conflict (key) do nothing;

-- ── Photos des donateurs et logos des organismes (org/<id>/…) ──────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 1048576, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;
