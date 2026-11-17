"use client";

// Panneau « Ajouter mon morceau »: tout se fait dans le vitrail.
// Montant (curseur + saisie), part du vitrail, rang, couleur du verre, nom, photo, message : chaque réglage
// s'affiche en direct sur le morceau d'aperçu. Puis paiement (Stripe ; le courriel est demandé là-bas).

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { INTL_TAG, type Locale } from "@/i18n/config";
import { useCharityNumber, useOrg } from "@/lib/useOrg";
import { useCount, useGlassName, useMoney, useOrdinal } from "@/lib/useI18n";
import { CONFIG, GLASS_COLORS } from "@/lib/config";
import { currentGlass } from "@/lib/theme";
import ContributionBlock, { ContributionRecap, contributionFor, useContributionConfig, type ContributionChoice } from "./ContributionBlock";
import { PhotoError, squareJpeg, uploadPhoto } from "@/lib/photoClient";
import TestimonialField from "./TestimonialField";
import { AnotherQuestion, useQuestionPicker } from "./QuestionPicker";
import { OrgMark } from '@/components/OrgBrand';
import Editable from '@/components/atelier/Editable';

const GOLD = "#F0B24A";

export interface ClaimDraft {
  name: string | null;
  color: string;
  photoSrc: string | null;
  message: string | null;
  /** Le don, sans les frais couverts : c'est la taille du morceau (et ce qui compte dans le total). */
  amountCents: number;
  /** Cadrage : 'place' (la place dans le vitrail, quand le montant change) ou 'detail' (gros plan quand le contenu change). */
  focus: "place" | "detail";
}

interface Props {
  /** Montants des morceaux actuels (part du vitrail, rang, « plus grand que »). */
  amounts: number[];
  typicalCents: number | null;
  /** Mode démo (pas de clé Stripe) : aucun paiement, aucun courriel ; on le dit clairement. */
  demo?: boolean;
  isMobile: boolean;
  /** Démo arrivée par le QR d'un écran (écran jumelé) : le morceau d'essai apparaît aussi sur le grand écran. */
  pairedScreen?: boolean;
  panelRef?: RefObject<HTMLDivElement | null>;
  /** 'overlay' : panneau posé sur le vitrail ; 'page' : la même chose en pleine page (formulaire mobile /don). */
  variant?: "overlay" | "page";
  /** Donateur reconnu par son lien (?t=…) : il agrandit son morceau, rien d'autre à remplir. */
  known?: KnownDonor | null;
  token?: string | null;
  /** Où revenir après Stripe : le vitrail, ou la page de remerciement du formulaire mobile. */
  returnTo?: "vitrail" | "don";
  /** Provenance par défaut (sinon celle de la session). */
  defaultChannel?: string;
  /**
   * Vitrail de démonstration : le panneau fonctionne en entier, mais rien ne part au serveur (photo gardée dans la page,
   * jamais téléversée) et le paiement est remplacé par une confirmation. Le morceau est remis à la page, qui le garde.
   */
  onDemoDonate?: (d: DemoDonation) => void;
  /** geometryChanged = la taille change (il faut recalculer le pavage) ; sinon simple mise à jour visuelle */
  onDraftChange: (draft: ClaimDraft, geometryChanged: boolean) => void;
  onClose?: () => void;
}

/** Don fictif du vitrail de démonstration : la photo est une data URL (elle doit survivre à un rechargement de l'onglet). */
export interface DemoDonation {
  amountCents: number;
  /** Ce que le donateur aurait payé (contribution à Donivers comprise). */
  paidCents: number;
  name: string | null;
  message: string | null;
  /** La question à laquelle répond le témoignage. */
  question: string | null;
  photoSrc: string | null;
  color: string;
}

export interface KnownDonor {
  donorId: string;
  name: string;
  showName: boolean;
  color: string;
  totalCents: number;
}

/** Brouillon gardé le temps du passage chez Stripe : si le donateur revient sans payer, il retrouve tout. */
const DRAFT_KEY = "vitrail:claim";
interface SavedDraft {
  amount: number;
  contribution?: { choice: ContributionChoice; other: string };
  name: string;
  color: string;
  message: string;
  quoteConsent?: boolean;
  mailing?: boolean;
  photo: { src: string | null; path: string | null };
}
function readSaved(): SavedDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as SavedDraft) : null;
  } catch {
    return null;
  }
}
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

const MIN = CONFIG.minAmountCents / 100;
const MAX = CONFIG.maxAmountCents / 100;

function formatShare(x: number, tag: string): string {
  const opts: Intl.NumberFormatOptions =
    x * 100 >= 1 ? { maximumFractionDigits: 1 } : { maximumSignificantDigits: 2 };
  return new Intl.NumberFormat(tag, { style: "percent", ...opts }).format(x);
}

export default function ClaimPanel({
  amounts,
  typicalCents,
  demo,
  isMobile,
  pairedScreen = false,
  panelRef,
  onDraftChange,
  onClose,
  variant = "overlay",
  known = null,
  token = null,
  returnTo = "vitrail",
  defaultChannel = "vitrail",
  onDemoDonate,
}: Props) {
  const showcase = !!onDemoDonate;
  const t = useTranslations("claim");
  const tp = useTranslations("photo");
  const te = useTranslations("erreurs");
  const tc = useTranslations("commun");
  const ti = useTranslations("identite");
  const org = useOrg();
  const charity = useCharityNumber();
  const money = useMoney();
  const count = useCount();
  const ordinal = useOrdinal();
  const glassName = useGlassName();
  const locale = useLocale() as Locale;
  const page = variant === "page";
  const overlayMobile = isMobile && !page;
  const localRef = useRef<HTMLDivElement | null>(null);
  const setPanel = (el: HTMLDivElement | null) => {
    localRef.current = el;
    if (panelRef) panelRef.current = el;
  };
  // Téléphone : le formulaire occupe tout l'écran et ne bouge pas pendant la saisie (décision de Mika, 14 nov. : remplir
  // correctement compte plus que voir son morceau en direct ; on le découvre une fois créé). « Voir mon morceau dans le
  // vitrail » le replie, à la demande seulement, en une barre « Revenir à mon don » qui le rouvre où on en était.
  const [peek, setPeek] = useState(false);
  const scrollBeforePeek = useRef(0);
  const togglePeek = (on: boolean) => {
    if (on) {
      scrollBeforePeek.current = localRef.current?.scrollTop ?? 0;
      (document.activeElement as HTMLElement | null)?.blur?.();
      setKeyboard(null);
    }
    setPeek(on);
  };
  // Téléphone, pendant la saisie : sur iPhone, le clavier recouvre le bas de la page sans la redimensionner, et Safari
  // déplace la partie visible (visualViewport) sur la page : un panneau ancré en bas disparaissait sous le clavier. Pendant
  // la saisie, le panneau est donc ancré en HAUT de la partie visible et en prend toute la hauteur ; la vignette revient
  // quand on quitte le champ.
  const [keyboard, setKeyboard] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!overlayMobile || !vv) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const a = document.activeElement as HTMLInputElement | null;
      const typing = !!a && !!localRef.current?.contains(a) && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !["checkbox", "radio", "range", "file", "button"].includes(a.type)));
      // Pas de détection du clavier (sur iPhone, innerHeight suit déjà la partie visible) : pendant toute saisie, le
      // panneau épouse la partie visible ; sans clavier, elle couvre tout l'écran, ce qui convient aussi.
      if (!typing || peek) return setKeyboard(null);
      // Repère des éléments fixes : l'écran, ou le cadre « transform » de la page de la démo (sous son bandeau)
      let frameTop = 0;
      for (let el = localRef.current?.parentElement ?? null; el; el = el.parentElement) {
        const cs = getComputedStyle(el);
        if (cs.transform !== "none") {
          frameTop = cs.position === "fixed" ? parseFloat(cs.top) || 0 : el.getBoundingClientRect().top;
          break;
        }
      }
      setKeyboard({ top: Math.round(vv.offsetTop - frameTop), height: Math.round(vv.height) });
    };
    // La sortie d'un champ précède l'entrée dans le suivant : on attend un instant avant de conclure
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(update, 120);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    document.addEventListener("focusin", later);
    document.addEventListener("focusout", later);
    return () => {
      clearTimeout(timer);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.removeEventListener("focusin", later);
      document.removeEventListener("focusout", later);
    };
  }, [overlayMobile, peek]);
  useEffect(() => {
    if (localRef.current) localRef.current.scrollTop = peek ? 0 : scrollBeforePeek.current;
  }, [peek]);
  const agrandir = !!(known && token);
  const [saved] = useState(readSaved);
  const start = saved?.amount ?? (typicalCents ? typicalCents / 100 : 25);
  const [amount, setAmountState] = useState(start);
  const [amountText, setAmountText] = useState(String(start));
  // Contribution à Donivers : la suggestion est présélectionnée (décision 1 de Mika, 16 nov.)
  const contributionConfig = useContributionConfig();
  const [contributionChoice, setContributionChoice] = useState<ContributionChoice>(saved?.contribution?.choice === "none" ? "other" : (saved?.contribution?.choice ?? "suggested"));
  const [contributionOther, setContributionOther] = useState(saved?.contribution?.other ?? "");
  const [name, setName] = useState(saved?.name ?? "");
  const [color, setColor] = useState<string>(
    currentGlass(saved?.color) ?? GLASS_COLORS[0].value,
  );
  const [message, setMessage] = useState(saved?.message ?? "");
  const [quoteConsent, setQuoteConsent] = useState(
    saved?.quoteConsent ?? false,
  );
  // Une des questions de l'organisme, au hasard ; c'est elle qu'on enregistre avec le témoignage
  const picker = useQuestionPicker(org.testimonial.questions);
  // Liste d'envoi de l'organisme : jamais cochée d'avance (consentement exprès, loi anti-pourriel)
  const [mailing, setMailing] = useState(saved?.mailing ?? false);
  const [photo, setPhoto] = useState<{
    src: string | null;
    path: string | null;
  }>(saved?.photo ?? { src: null, path: null });
  const photoBlob = useRef<Blob | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Démonstration : l'étape de paiement, remplacée par une confirmation
  const [confirming, setConfirming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Couleur tirée au hasard à l'ouverture (le serveur ne peut pas faire le même tirage), sauf brouillon retrouvé
  useEffect(() => {
    if (saved) {
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {}
      return;
    }
    Promise.resolve().then(() =>
      setColor(
        GLASS_COLORS[Math.floor(Math.random() * GLASS_COLORS.length)].value,
      ),
    );
  }, [saved]);

  const baseCents = Math.round(amount * 100);
  const contribution = contributionFor(contributionChoice, contributionOther, baseCents, contributionConfig);
  const payCents = baseCents + contribution.cents;
  const showName = name.trim().length >= 2;

  // ---------- Aperçu en direct dans le vitrail ----------
  const lastGeometry = useRef("");
  const focusRef = useRef<"place" | "detail">("place");
  const lastContent = useRef<string | null>(null);
  const lastAmount = useRef<number | null>(null);
  useEffect(() => {
    const contentKey = [
      name.trim(),
      color,
      photo.src ?? "",
      message.trim(),
    ].join("|");
    if (lastContent.current === null) lastContent.current = contentKey;
    else if (contentKey !== lastContent.current) {
      focusRef.current = "detail";
      lastContent.current = contentKey;
    }
    if (lastAmount.current !== null && baseCents !== lastAmount.current)
      focusRef.current = "place";
    lastAmount.current = baseCents;
    const draft: ClaimDraft = {
      name: showName ? name.trim() : null,
      color,
      photoSrc: photo.src,
      message: message.trim() || null,
      amountCents: baseCents,
      focus: focusRef.current,
    };
    const geometryKey = String(baseCents);
    const geometryChanged = geometryKey !== lastGeometry.current;
    // La taille change : on attend que le curseur se pose avant de recalculer le pavage
    const timer = setTimeout(
      () => {
        lastGeometry.current = geometryKey;
        onDraftChange(draft, geometryChanged);
      },
      geometryChanged ? 280 : 0,
    );
    return () => clearTimeout(timer);
  }, [name, showName, color, photo.src, message, baseCents, onDraftChange]);

  // ---------- Chiffres ----------
  // Avec un lien « agrandir », on compte ce que le donateur a déjà donné (amounts n'inclut pas son morceau)
  const mine = (agrandir ? known!.totalCents : 0) + baseCents;
  const total = amounts.reduce((s, a) => s + a, 0);
  const share = total + mine > 0 ? mine / (total + mine) : 0;
  const bigger = amounts.filter((a) => a < mine).length;
  const rank = amounts.filter((a) => a > mine).length + 1;

  const setAmount = (a: number) => {
    const clamped = Math.max(MIN, Math.min(MAX, Math.round(a)));
    setAmountState(clamped);
    setAmountText(String(clamped));
  };

  // ---------- Photo : recadrée en carré et envoyée tout de suite ----------
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setPhotoBusy(true);
    try {
      const blob = await squareJpeg(file);
      if (showcase) {
        // Démonstration : la photo reste dans la page (data URL, qui survit au rechargement), jamais envoyée
        photoBlob.current = null;
        setPhoto({ src: await blobToDataUrl(blob), path: null });
        return;
      }
      photoBlob.current = blob;
      const src = URL.createObjectURL(blob);
      setPhoto({ src, path: null });
      const path = await uploadPhoto(blob);
      setPhoto({ src, path });
    } catch (err) {
      setError(err instanceof PhotoError ? (err.serverMessage ?? tp(`erreurs.${err.key}`)) : tp("erreurs.envoi"));
      setPhoto({ src: null, path: null });
    } finally {
      setPhotoBusy(false);
    }
  };

  // ---------- Paiement ----------
  const valid =
    amount >= MIN &&
    amount <= MAX &&
    (!name.trim() || showName) &&
    !contribution.error &&
    !busy &&
    !photoBusy;
  const submit = async () => {
    if (!valid) return;
    if (showcase) {
      setError(null);
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError(null);
    let channel: string | null = defaultChannel;
    try {
      channel = sessionStorage.getItem("vitrail:src") || defaultChannel;
    } catch {}
    try {
      const res = await fetch("/api/donate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents: baseCents,
          contributionCents: contribution.cents,
          contributionShown: true,
          mailingConsent: mailing,
          returnTo,
          channel,
          ...(agrandir
            ? { token }
            : {
                showName,
                name: showName ? name.trim() : "",
                message: message.trim(),
                quoteConsent: quoteConsent && !!message.trim(),
                question: message.trim() ? picker.question : null,
                color,
                photoPath: photo.path ?? undefined,
              }),
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          typeof data.error === "string" && data.error
            ? data.error
            : t("erreurInattendue"),
        );
      // Brouillon gardé pour un éventuel retour sans paiement (la photo en data URL : l'adresse blob: ne survit pas)
      try {
        const src =
          photo.src?.startsWith("blob:") && photoBlob.current
            ? await blobToDataUrl(photoBlob.current)
            : photo.src;
        const draft: SavedDraft = {
          amount,
          contribution: { choice: contributionChoice, other: contributionOther },
          name,
          color,
          message,
          quoteConsent,
          mailing,
          photo: { src, path: photo.path },
        };
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {}
      window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div
      ref={setPanel}
      style={
        page
          ? pageStyle
          : {
              // Ordinateur : ancré à droite (comme la fiche d'un morceau), le morceau est cadré à gauche.
              // Téléphone : plein écran (replié en barre pour « Voir mon morceau »).
              position: "fixed",
              // Téléphone, plein écran : par-dessus l'en-tête du vitrail (le panneau a son titre et sa croix)
              zIndex: isMobile && !peek ? 1100 : 160,
              left: isMobile ? 0 : "auto",
              right: isMobile ? 0 : "16px",
              top: !isMobile ? "72px" : keyboard ? `${keyboard.top}px` : peek ? "auto" : 0,
              // Plus large pour la lisibilité (Mika, 17 nov.) ; le vitrail recadre le morceau d'après la largeur réelle (page.tsx)
              width: isMobile ? "auto" : "min(520px, max(400px, 42vw), calc(100% - 32px))",
              bottom: isMobile && !keyboard ? 0 : "auto",
              height: keyboard ? `${keyboard.height}px` : undefined,
              maxHeight: !isMobile
                ? "calc(100vh - var(--demo-bandeau, 0px) - 72px - 16px)"
                : peek
                ? "calc(80px + env(safe-area-inset-bottom, 0px))"
                : "none",
              alignContent: "start",
              overflowY: peek ? "hidden" : "auto",
              background: "rgba(20,18,29, 0.95)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: isMobile ? (peek ? "16px 16px 0 0" : 0) : "14px",
              padding: isMobile
                ? "16px 16px calc(16px + env(safe-area-inset-bottom, 0px))"
                : "18px 20px",
              boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
              backdropFilter: "blur(10px)",
              display: "grid",
              gap: "14px",
              color: "#F4EFE6",
              fontFamily: "'DM Sans', sans-serif",
            }
      }
    >
      {/* Téléphone, formulaire replié : une seule barre pour y revenir */}
      {overlayMobile && peek && (
        <button onClick={() => togglePeek(false)} style={{ ...goldStyle, flex: "none", width: "100%" }}>
          {t("revenirDon")}
        </button>
      )}
      {/* Téléphone : le titre reste en haut du formulaire quand on le fait défiler */}
      <div style={overlayMobile ? (peek ? { display: "none" } : stickyHeadStyle) : { display: "contents" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <h2 className="font-display" style={{ margin: 0, fontSize: "24px" }}>
          {confirming
            ? t("demoPaiement.titre")
            : agrandir
            ? known!.showName && known!.name
              ? t("agrandirNom", { nom: known!.name })
              : t("agrandir")
            : t("titre")}
        </h2>
        {onClose && (
          <button onClick={onClose} aria-label={tc("fermer")} style={closeStyle}>
            ×
          </button>
        )}
      </div>
      </div>

      {/* Toujours là : on arrive parfois d'un code QR sans avoir vu le vitrail */}
      <p style={{ margin: 0, fontSize: "16px", color: "rgba(255,255,255,0.72)", lineHeight: 1.45 }}>{t("public")}</p>

      {confirming && onDemoDonate ? (
        <DemoCheckout
          payCents={payCents}
          name={showName ? name.trim() : null}
          color={color}
          onBack={() => setConfirming(false)}
          onConfirm={() =>
            onDemoDonate({
              amountCents: baseCents,
              paidCents: payCents,
              name: showName ? name.trim() : null,
              message: message.trim() || null,
              question: message.trim() ? picker.question : null,
              photoSrc: photo.src,
              color,
            })
          }
        />
      ) : (
      <>
      {agrandir && (
        <p
          style={{
            margin: 0,
            fontSize: "17px",
            color: "rgba(255,255,255,0.8)",
            lineHeight: 1.45,
          }}
        >
          {t.rich("dejaDonne", {
            montant: money(known!.totalCents),
            b: (chunks) => <b style={{ color: GOLD }}>{chunks}</b>,
          })}
        </p>
      )}

      {/* Où va le don */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "center",
          padding: "10px 12px",
          borderRadius: "8px",
          border: "1px solid rgba(240,178,74,0.3)",
          background: "rgba(240,178,74,0.06)",
        }}
      >
        <Editable field="icon">
          <OrgMark size={30} />
        </Editable>
        <span
          style={{
            fontSize: "16px",
            lineHeight: 1.45,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          {/* Le texte proposé nomme déjà l'organisme (« Votre don aide {org}… ») : sans cette phrase, il se répéterait */}
          {org.why !== ti("why", { org: org.name }) && (
            <>
              {t.rich("destination", {
                org: org.name,
                b: (chunks) => <strong style={{ color: GOLD }}>{chunks}</strong>,
              })}{" "}
            </>
          )}
          <Editable field="why">{org.why}</Editable>
        </span>
      </div>

      {/* ---------- 1. Votre don (Mika, 17 nov. : sections numérotées ; montants rapides plutôt que le curseur) ---------- */}
      <section style={sectionStyle} aria-labelledby="claim-s1">
        <SectionHead n={1} id="claim-s1" title={t("sectionDon")} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }} role="group" aria-label={t("montantsRapides")}>
          {quickAmounts(typicalCents).map((v) => {
            const on = amount === v;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={on}
                onClick={() => setAmount(v)}
                style={{
                  ...chipStyle,
                  borderColor: on ? GOLD : "rgba(255,255,255,0.22)",
                  background: on ? "rgba(240,178,74,0.14)" : "transparent",
                  color: on ? GOLD : "#F4EFE6",
                }}
              >
                {money(v * 100)}
              </button>
            );
          })}
        </div>
        <label htmlFor="claim-amount-input" style={amountFieldStyle}>
          <span style={{ fontSize: "16px", color: "rgba(255,255,255,0.82)", flex: "none" }}>{t("autreMontant")}</span>
          <span style={{ display: "flex", alignItems: "baseline", gap: "4px", marginLeft: "auto", color: GOLD }}>
            {locale === "en" && <span style={{ fontSize: "24px", fontWeight: 700 }}>$</span>}
            <input
              id="claim-amount-input"
              inputMode="numeric"
              value={amountText}
              aria-label={t("montant")}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d]/g, "");
                setAmountText(v);
                const n = parseInt(v, 10);
                if (n >= 1) setAmountState(Math.min(n, MAX));
              }}
              onFocus={(e) => e.target.select()}
              onBlur={() => setAmount(amount)}
              style={{
                width: `${Math.max(3, amountText.length) + 0.6}ch`,
                background: "transparent",
                border: 0,
                color: GOLD,
                font: "700 24px 'DM Sans', sans-serif",
                textAlign: "right",
                padding: 0,
                fontVariantNumeric: "tabular-nums",
                outline: "none",
              }}
            />
            {locale === "fr" && <span style={{ fontSize: "24px", fontWeight: 700 }}>$</span>}
          </span>
        </label>
        {amount < MIN && (
          <p style={{ ...hintStyle, color: "#f87171" }}>
            {te("montantMin", { montant: money(CONFIG.minAmountCents) })}
          </p>
        )}
        <p style={hintStyle}>
          {typicalCents ? `${t("typique", { montant: money(typicalCents) })} ` : ""}
          {t("tailleMontant")}
        </p>
        {overlayMobile && !confirming && (
          <button type="button" onClick={() => togglePeek(true)} style={peekStyle}>
            {t("voirMorceau")}
          </button>
        )}
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "5px 12px",
            margin: 0,
            fontSize: "16px",
          }}
        >
          <dt style={dtStyle}>{t("part")}</dt>
          <dd style={monoStyle}>{formatShare(share, INTL_TAG[locale])}</dd>
          <dt style={dtStyle}>{t("plusGrandQue")}</dt>
          <dd style={monoStyle}>
            {t("plusGrandQueValeur", { count: bigger, total: count(amounts.length) })}
          </dd>
          <dt style={dtStyle}>{t("rang")}</dt>
          <dd style={monoStyle}>{ordinal(rank)}</dd>
        </dl>

      </section>

      {!agrandir && (
        <section style={sectionStyle} aria-labelledby="claim-s2">
          <SectionHead n={2} id="claim-s2" title={t("sectionMorceau")} note={t("facultatif")} />
          {/* ---------- Nom affiché : avant le témoignage (en dernier, on l'oubliait) ---------- */}
          {/* Même encadré doré que le témoignage : ce sont les deux choses qui s'affichent sur le morceau */}
          <label style={{ ...cardStyle, display: "grid", gap: "8px" }}>
            <span>
              <span style={cardTitleStyle}>{t("nomTitre")}</span>
              <span style={{ display: "block", fontSize: "17px", color: GOLD, marginTop: "2px" }}>{t("nomAide")}</span>
            </span>
            <input
              type="text"
              value={name}
              maxLength={CONFIG.nameMax}
              placeholder={t("nomPlaceholder")}
              onChange={(e) => setName(e.target.value)}
              style={{ ...inputStyle, fontSize: "18px", padding: "14px" }}
              autoComplete="nickname"
            />
            {name.trim().length === 1 && (
              <span style={{ fontSize: "15px", color: "#f87171" }}>
                {t("nomCourt")}
              </span>
            )}
          </label>

          {/* ---------- Témoignage : bien en vue, sous le nom (c'est ce qui rend le vitrail vivant) ---------- */}
          <div style={{ ...cardStyle, display: "grid", gap: "8px" }}>
            <div>
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "#F4EFE6",
                  lineHeight: 1.3,
                }}
              >
                <Editable field="question">{picker.question}</Editable>
              </div>
              <div style={{ fontSize: "17px", color: GOLD, marginTop: "2px" }}>
                {org.testimonial.cta}
              </div>
            </div>
            <TestimonialField
              value={message}
              onChange={setMessage}
              consent={quoteConsent}
              onConsent={setQuoteConsent}
              rows={3}
            />
            {picker.canChange && <AnotherQuestion onClick={picker.next} />}
          </div>

          {/* ---------- Le morceau ---------- */}
          <div style={{ display: "grid", gap: "6px" }}>
            <span style={labelStyle}>{t("verre")}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {GLASS_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  title={glassName(c)}
                  aria-label={glassName(c)}
                  aria-pressed={color === c.value}
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    background: c.value,
                    border:
                      color === c.value
                        ? "2px solid #fff"
                        : "2px solid transparent",
                    boxShadow:
                      color === c.value ? `0 0 10px ${c.value}` : "none",
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>
          </div>


          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {photo.src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo.src}
                alt=""
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "8px",
                  objectFit: "cover",
                }}
              />
            )}
            <button
              type="button"
              disabled={photoBusy}
              onClick={() => fileRef.current?.click()}
              style={secondaryStyle}
            >
              {photoBusy
                ? tp("envoi")
                : photo.src
                  ? tp("changer")
                  : tp("ajouter")}
            </button>
            {photo.src && !photoBusy && (
              <button
                type="button"
                onClick={() => {
                  photoBlob.current = null;
                  setPhoto({ src: null, path: null });
                }}
                style={linkButtonStyle}
              >
                {tp("retirer")}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              hidden
            />
          </div>

          <p style={{ ...hintStyle, marginTop: "-6px" }}>
            {t("facultatifs")}
          </p>
        </section>
      )}

      {/* ---------- 3. Paiement : la contribution, détachée dans son encadré, puis le total et le bouton ---------- */}
      <section style={sectionStyle} aria-labelledby="claim-s3">
        <SectionHead n={agrandir ? 2 : 3} id="claim-s3" title={t("sectionPaiement")} />
        <div style={contributionBoxStyle}>
          <ContributionBlock
            donCents={baseCents}
            orgName={org.name}
            config={contributionConfig}
            choice={contributionChoice}
            otherText={contributionOther}
            onChoice={(c) => {
              // « Autre montant » part de 0 (Mika, 17 nov., comme Zeffy) : c'est aussi le chemin pour ne rien ajouter
              if (c === "other") setContributionOther("");
              setContributionChoice(c);
            }}
            onOtherText={setContributionOther}
          />
        </div>
        <ContributionRecap donCents={baseCents} cents={contribution.error ? 0 : contribution.cents} orgName={org.name} charity={contributionConfig.charity} />
        <label
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "flex-start",
            fontSize: "16px",
            color: "rgba(255,255,255,0.75)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={mailing}
            onChange={(e) => setMailing(e.target.checked)}
            style={{ accentColor: GOLD, marginTop: "2px" }}
          />
          <span>{t("listeEnvoi", { org: org.name })}</span>
        </label>
      </section>

      {error && (
        <p style={{ margin: 0, fontSize: "16px", color: "#f87171" }}>{error}</p>
      )}
      {(demo || showcase) && (
        <p
          style={{
            margin: 0,
            padding: "8px 10px",
            borderRadius: "8px",
            fontSize: "15px",
            lineHeight: 1.45,
            color: "#FFE2A8",
            background: "rgba(240,178,74,0.08)",
            border: "1px dashed rgba(240,178,74,0.45)",
          }}
        >
          {showcase ? t(pairedScreen ? "demoVitrineEcran" : "demoVitrine") : t("demo")}
        </p>
      )}

      <div style={page ? stickyBar : { display: "flex", gap: "8px" }}>
        <button
          type="button"
          onClick={submit}
          disabled={!valid}
          style={{
            ...goldStyle,
            opacity: valid ? 1 : 0.45,
            cursor: valid ? "pointer" : "not-allowed",
          }}
        >
          {busy ? t("instant") : t("donner", { montant: money(payCents) })}
        </button>
      </div>
      <p style={{ ...hintStyle, textAlign: "center" }}>
        {showcase ? t("piedDemo") : charity ? t("piedAvecNumero", { org: org.name }) : t("pied")}{" "}
        <Link
          href="/confidentialite"
          target="_blank"
          style={{ color: "rgba(255,255,255,0.82)" }}
        >
          {tc("confidentialiteCourt")}
        </Link>
        {" · "}
        <Link
          href="/conditions"
          target="_blank"
          style={{ color: "rgba(255,255,255,0.82)" }}
        >
          {tc("conditionsCourt")}
        </Link>
      </p>
      </>
      )}
    </div>
  );
}

/**
 * Démonstration : à la place de Stripe, une étape qui dit ce qui se passerait et confirme qu'aucun paiement n'a lieu.
 * Le récapitulatif reprend le montant et le verre, pour qu'on sache ce qu'on « donne ».
 */
function DemoCheckout({
  payCents,
  name,
  color,
  onBack,
  onConfirm,
}: {
  payCents: number;
  name: string | null;
  color: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("claim.demoPaiement");
  const tc = useTranslations("commun");
  const money = useMoney();
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => confirmRef.current?.focus(), []);
  return (
    <div style={{ display: "grid", gap: "14px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px",
          borderRadius: "10px",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        <span
          aria-hidden
          style={{
            width: "34px",
            height: "34px",
            flex: "none",
            borderRadius: "8px",
            background: color,
            boxShadow: `0 0 14px ${color}`,
          }}
        />
        <span style={{ display: "grid", gap: "2px" }}>
          <span style={{ fontSize: "24px", fontWeight: 700, color: GOLD }}>{money(payCents)}</span>
          <span style={{ fontSize: "16px", color: "rgba(255,255,255,0.82)" }}>{name ?? tc("anonyme")}</span>
        </span>
      </div>
      <p style={{ margin: 0, fontSize: "17px", lineHeight: 1.5, color: "rgba(255,255,255,0.85)" }}>
        {t("texte")}
      </p>
      <p
        style={{
          margin: 0,
          padding: "10px 12px",
          borderRadius: "8px",
          fontSize: "16px",
          lineHeight: 1.45,
          color: "#FFE2A8",
          background: "rgba(240,178,74,0.08)",
          border: "1px dashed rgba(240,178,74,0.45)",
        }}
      >
        {t("aucunPaiement")}
      </p>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button type="button" onClick={onBack} style={secondaryStyle}>
          {t("modifier")}
        </button>
        <button ref={confirmRef} type="button" onClick={onConfirm} style={goldStyle}>
          {t("confirmer")}
        </button>
      </div>
    </div>
  );
}

/** Montants rapides : 20, 50, 100 et 250 $, avec le montant habituel de l'organisme à la place du plus proche. */
function quickAmounts(typicalCents: number | null): number[] {
  const base = [20, 50, 100, 250];
  const typical = typicalCents ? Math.round(typicalCents / 100) : null;
  if (!typical || typical < MIN || typical > MAX || base.includes(typical)) return base;
  const nearest = base.reduce((best, v) => (Math.abs(Math.log(v / typical)) < Math.abs(Math.log(best / typical)) ? v : best));
  return base.map((v) => (v === nearest ? typical : v)).sort((x, y) => x - y);
}

function SectionHead({ n, id, title, note }: { n: number; id: string; title: string; note?: string }) {
  return (
    <h3 id={id} style={{ margin: 0, display: "flex", alignItems: "center", gap: "10px", fontSize: "19px", fontWeight: 700, color: "#F4EFE6" }}>
      <span aria-hidden style={sectionNumberStyle}>
        {n}
      </span>
      {title}
      {note && <span style={{ fontSize: "15px", fontWeight: 400, color: "rgba(255,255,255,0.72)" }}>{note}</span>}
    </h3>
  );
}

// ---------- Styles ----------
const labelStyle: CSSProperties = {
  fontSize: "14px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.82)",
};
const dtStyle: CSSProperties = { color: "rgba(255,255,255,0.82)" };
const monoStyle: CSSProperties = {
  margin: 0,
  fontFamily: "'DM Sans', sans-serif",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};
const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: "16px",
  color: "rgba(255,255,255,0.82)",
  lineHeight: 1.5,
};
const inputStyle: CSSProperties = {
  font: "500 16px 'DM Sans', sans-serif", // 16 px minimum : sinon Safari (iPhone) agrandit la page au toucher du champ
  color: "#F4EFE6",
  background: "#0B0A12",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "8px",
  padding: "10px 12px",
  width: "100%",
  boxSizing: "border-box",
};
const goldStyle: CSSProperties = {
  flex: 1,
  padding: "12px 16px",
  background: GOLD,
  color: "#1A1208",
  border: 0,
  borderRadius: "8px",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: "17px",
  fontWeight: 600,
  cursor: "pointer",
};
const secondaryStyle: CSSProperties = {
  padding: "10px 14px",
  background: "rgba(255,255,255,0.08)",
  color: "#F4EFE6",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "8px",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: "17px",
  cursor: "pointer",
};
const linkButtonStyle: CSSProperties = {
  background: "none",
  border: 0,
  padding: 0,
  color: "rgba(255,255,255,0.82)",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: "16px",
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: "3px",
};
const pageStyle: CSSProperties = {
  position: "relative",
  display: "grid",
  gap: "14px",
  alignContent: "start",
  background: "rgba(20,18,29, 0.95)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "14px",
  padding: "18px 16px 0",
  color: "#F4EFE6",
  fontFamily: "'DM Sans', sans-serif",
};
/** Formulaire mobile : le bouton reste à portée de pouce, en bas de l'écran. */
const stickyBar: CSSProperties = {
  position: "sticky",
  bottom: 0,
  zIndex: 5,
  display: "flex",
  gap: "8px",
  margin: "0 -16px",
  padding: "14px 16px max(14px, env(safe-area-inset-bottom))",
  background: "linear-gradient(rgba(20,18,29,0), rgba(20,18,29,0.98) 30%)",
  borderRadius: "0 0 14px 14px",
};
/** Encadré doré du nom et du témoignage. */
const cardStyle: CSSProperties = {
  padding: "14px",
  borderRadius: "10px",
  border: "1px solid rgba(240,178,74,0.45)",
  background: "rgba(240,178,74,0.07)",
  boxShadow: "0 0 24px rgba(240,178,74,0.08)",
};
const cardTitleStyle: CSSProperties = { display: "block", fontSize: "18px", fontWeight: 700, color: "#F4EFE6", lineHeight: 1.3 };
const stickyHeadStyle: CSSProperties = {
  position: "sticky",
  top: "-16px",
  zIndex: 2,
  display: "grid",
  gap: "8px",
  margin: "-16px -16px 0",
  padding: "14px 16px 10px",
  background: "rgb(20,18,29)",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};
const peekStyle: CSSProperties = {
  justifySelf: "start",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.3)",
  borderRadius: "8px",
  color: "#F4EFE6",
  font: "600 16px 'DM Sans', sans-serif",
  padding: "10px 14px",
  cursor: "pointer",
};
const closeStyle: CSSProperties = {
  background: "none",
  border: 0,
  color: "rgba(255,255,255,0.82)",
  fontSize: "24px",
  cursor: "pointer",
  lineHeight: 1,
};
const sectionStyle: CSSProperties = { display: "grid", gap: "12px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.12)" };
const sectionNumberStyle: CSSProperties = {
  flex: "none",
  width: "28px",
  height: "28px",
  borderRadius: "50%",
  border: `1.5px solid ${GOLD}`,
  color: GOLD,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "15px",
};
const chipStyle: CSSProperties = {
  font: "600 17px 'DM Sans', sans-serif",
  padding: "10px 14px",
  minHeight: "46px",
  borderRadius: "10px",
  border: "1px solid",
  cursor: "pointer",
  fontVariantNumeric: "tabular-nums",
};
const amountFieldStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "8px 14px",
  minHeight: "52px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.3)",
  background: "#0B0A12",
  cursor: "text",
};
/** La contribution, détachée du reste (Mika, 17 nov.) : un encadré neutre, pas doré (le doré est pour le morceau). */
const contributionBoxStyle: CSSProperties = {
  padding: "14px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.05)",
};
