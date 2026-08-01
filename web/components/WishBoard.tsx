"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import { UserButton } from "@clerk/nextjs";
import {
  ExternalLink,
  Eye,
  EyeOff,
  Heart,
  Loader2,
  Lock,
  MapPin,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { yen } from "@/lib/ops";

/**
 * What each of us wants out of this trip.
 *
 * Shared wishes feed planning — the kids put their own ideas in and they get
 * weighed like anything else. Private wishes are visible only to whoever added
 * them, which is what makes it safe to note a present for someone who also
 * uses this app. The filtering happens on the server (convex/wishes.ts); this
 * component never receives a row it should not show.
 */

const KINDS = [
  { value: "attraction", label: "אטרקציה" },
  { value: "place", label: "מקום" },
  { value: "product", label: "מוצר לקנות" },
  { value: "food", label: "אוכל" },
  { value: "experience", label: "חוויה" },
  { value: "other", label: "אחר" },
] as const;

const PRIORITIES = [
  { value: "must", label: "חובה" },
  { value: "want", label: "רוצה" },
  { value: "maybe", label: "אולי" },
] as const;

const STATUSES = [
  { value: "idea", label: "רעיון" },
  { value: "approved", label: "מאושר" },
  { value: "done", label: "הושג" },
  { value: "dropped", label: "ירד" },
] as const;

type Kind = (typeof KINDS)[number]["value"];
type Priority = (typeof PRIORITIES)[number]["value"];
type Status = (typeof STATUSES)[number]["value"];

const kindLabel = (v: string) => KINDS.find((k) => k.value === v)?.label ?? v;
const priorityLabel = (v: string) => PRIORITIES.find((k) => k.value === v)?.label ?? v;

function AddWishForm({ onDone }: { onDone: () => void }) {
  const add = useMutation(api.wishes.add);
  const [kind, setKind] = useState<Kind>("product");
  const [title, setTitle] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [priceYen, setPriceYen] = useState("");
  const [priority, setPriority] = useState<Priority>("want");
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await add({
        kind,
        title: title.trim(),
        titleEn: titleEn.trim() || undefined,
        note: note.trim() || undefined,
        url: url.trim() || undefined,
        priceYen: priceYen.trim() ? Number(priceYen) : undefined,
        priority,
        visibility: isPrivate ? "private" : "shared",
      });
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "לא הצלחנו לשמור");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card wish-form" onSubmit={submit}>
      <div className="wish-form-row">
        <label>
          <span className="eyebrow">סוג</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="eyebrow">כמה חשוב</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        <span className="eyebrow">מה זה</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="פיגורת פיקאצ׳ו"
          required
        />
      </label>

      <label>
        <span className="eyebrow">השם באנגלית או ביפנית — כדי שאפשר יהיה לבקש בחנות</span>
        <input
          dir="ltr"
          value={titleEn}
          onChange={(e) => setTitleEn(e.target.value)}
          placeholder="Pikachu figure"
        />
      </label>

      <div className="wish-form-row">
        <label>
          <span className="eyebrow">מחיר משוער בין (לא חובה)</span>
          <input
            dir="ltr"
            inputMode="numeric"
            value={priceYen}
            onChange={(e) => setPriceYen(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="3000"
          />
        </label>
        <label className="wish-private-toggle">
          <span className="eyebrow">מי רואה</span>
          <button
            type="button"
            className={`btn btn-sm wish-vis ${isPrivate ? "btn-dark" : "btn-ghost"}`}
            onClick={() => setIsPrivate((v) => !v)}
            aria-pressed={isPrivate}
          >
            {isPrivate ? <Lock size={14} /> : <Eye size={14} />}
            {isPrivate ? "רק אני" : "כל המשפחה"}
          </button>
        </label>
      </div>

      <label>
        <span className="eyebrow">הערה (לא חובה)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </label>

      <label>
        <span className="eyebrow">קישור (לא חובה)</span>
        <input dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>

      {error ? <p className="wish-error">{error}</p> : null}

      <button className="btn btn-primary" type="submit" disabled={saving}>
        {saving ? "שומר…" : "הוספה לרשימה"}
      </button>
    </form>
  );
}

/**
 * Hand a half-formed idea to eve.
 *
 * This is the interesting way in. "פיגורת פיקאצ׳ו" is not a wish anyone can
 * act on; eve turns it into a price, a shop, and — when the shop happens to be
 * on a day we are already walking — an entry on that day's page.
 *
 * The wish is created HERE rather than by the agent, so it carries the right
 * owner and visibility from the first moment: ownership comes from the signed-in
 * session, and eve is never allowed to change it.
 */
function AskEveForm({ onDone }: { onDone: () => void }) {
  const request = useMutation(api.wishes.requestResearch);
  const [promptText, setPromptText] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [priority, setPriority] = useState<Priority>("want");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!promptText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await request({
        promptText: promptText.trim(),
        priority,
        visibility: isPrivate ? "private" : "shared",
      });
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "לא הצלחנו לשמור");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card wish-form wish-ask" onSubmit={submit}>
      <p className="wish-ask-lede">
        <Sparkles size={15} />
        תארו מה אתם רוצים — eve תבדוק מה זה בדיוק, כמה זה עולה ואיפה משיגים את זה
        על המסלול שלנו.
      </p>

      <label>
        <span className="eyebrow">מה אתם מחפשים</span>
        <textarea
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          rows={3}
          placeholder="פיגורה של פיקאצ׳ו, לא ענקית, עד בערך ¥4,000"
          required
        />
      </label>

      <div className="wish-form-row">
        <label>
          <span className="eyebrow">כמה חשוב</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="wish-private-toggle">
          <span className="eyebrow">מי רואה</span>
          <button
            type="button"
            className={`btn btn-sm wish-vis ${isPrivate ? "btn-dark" : "btn-ghost"}`}
            onClick={() => setIsPrivate((v) => !v)}
            aria-pressed={isPrivate}
          >
            {isPrivate ? <Lock size={14} /> : <Eye size={14} />}
            {isPrivate ? "רק אני" : "כל המשפחה"}
          </button>
        </label>
      </div>

      {error ? <p className="wish-error">{error}</p> : null}

      <button className="btn btn-primary" type="submit" disabled={saving}>
        {saving ? "שולח…" : "לשלוח ל־eve"}
      </button>

      <p className="wish-ask-note">
        יש לכם צילום מסך? שלחו אותו ל־eve ב<Link href="/chat">צ׳אט</Link> — שם היא רואה
        תמונות ויכולה להוסיף מהן משאלה.
      </p>
    </form>
  );
}

type Wish = {
  id: Id<"wishes">;
  kind: string;
  title: string;
  titleEn?: string;
  titleJa?: string;
  note?: string;
  url?: string;
  priceYen?: number;
  priority: string;
  visibility: string;
  ownerName: string;
  status: string;
  mine: boolean;
  whereToBuy?: {
    shop: string;
    shopJa?: string;
    area?: string;
    dayN?: number;
    priceYen?: number;
    url?: string;
    note?: string;
  }[];
  sources?: { label: string; url: string }[];
  images: { url: string | null; alt?: string }[];
  researchedBy?: string;
};

function WishCard({ wish }: { wish: Wish }) {
  const update = useMutation(api.wishes.update);
  const remove = useMutation(api.wishes.remove);
  const [busy, setBusy] = useState(false);

  const foreign = [wish.titleEn, wish.titleJa].filter(Boolean).join(" · ");

  return (
    <article className="card wish-card" data-status={wish.status}>
      <div className="wish-card-head">
        <span className="chip">{kindLabel(wish.kind)}</span>
        <span className={`chip wish-pri-${wish.priority}`}>{priorityLabel(wish.priority)}</span>
        {wish.visibility === "private" ? (
          <span className="chip wish-private">
            <Lock size={11} />
            רק אני
          </span>
        ) : null}
      </div>

      <h3>{wish.title}</h3>
      {foreign ? (
        <span className="wish-foreign" dir="ltr">
          {foreign}
        </span>
      ) : null}

      <p className="wish-owner">
        <Heart size={12} />
        {wish.ownerName} ביקש/ה
        {wish.priceYen ? <span dir="ltr"> · ~{yen(wish.priceYen)}</span> : null}
      </p>

      {wish.status === "researching" ? (
        <p className="wish-busy">
          <Loader2 size={13} />
          eve בודקת את זה עכשיו — מחיר, חנויות ותמונות יופיעו כאן.
        </p>
      ) : null}

      {wish.note ? <p className="wish-note">{wish.note}</p> : null}

      {wish.images?.some((img) => img.url) ? (
        <div className="wish-images">
          {wish.images
            .filter((img) => img.url)
            .map((img) => (
              <img key={img.url} src={img.url!} alt={img.alt ?? wish.title} loading="lazy" />
            ))}
        </div>
      ) : null}

      {wish.whereToBuy?.length ? (
        <ul className="wish-shops">
          {wish.whereToBuy.map((shop, index) => (
            <li key={`${shop.shop}-${index}`}>
              <ShoppingBag size={12} />
              <span>
                {shop.shop}
                {shop.shopJa ? (
                  <span className="name-foreign" dir="ltr" lang="ja">
                    {shop.shopJa}
                  </span>
                ) : null}
              </span>
              {shop.area ? (
                <span className="wish-shop-area">
                  <MapPin size={11} />
                  {shop.area}
                  {shop.dayN ? ` · יום ${shop.dayN}` : ""}
                </span>
              ) : null}
              {shop.priceYen ? (
                <span className="wish-shop-price" dir="ltr">
                  {yen(shop.priceYen)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {wish.sources?.length ? (
        <p className="wish-sources">
          מקורות:{" "}
          {wish.sources.map((source, index) => (
            <span key={source.url}>
              {index > 0 ? " · " : ""}
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.label}
              </a>
            </span>
          ))}
        </p>
      ) : null}

      {wish.url ? (
        <a className="text-link" href={wish.url} target="_blank" rel="noreferrer">
          לקישור
          <ExternalLink size={13} />
        </a>
      ) : null}

      <div className="wish-actions">
        <select
          value={wish.status}
          disabled={busy || (!wish.mine && wish.visibility === "private")}
          onChange={async (e) => {
            setBusy(true);
            try {
              await update({ id: wish.id, status: e.target.value as Status });
            } finally {
              setBusy(false);
            }
          }}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {wish.mine ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={async () => {
              if (!confirm(`למחוק את "${wish.title}"?`)) return;
              setBusy(true);
              try {
                await remove({ id: wish.id });
              } finally {
                setBusy(false);
              }
            }}
          >
            <Trash2 size={14} />
            מחיקה
          </button>
        ) : null}
      </div>
    </article>
  );
}

function Board() {
  const wishes = useQuery(api.wishes.list) as Wish[] | undefined;
  const [adding, setAdding] = useState(false);
  const [asking, setAsking] = useState(false);
  const [person, setPerson] = useState<string>("all");
  const [showDropped, setShowDropped] = useState(false);

  const people = useMemo(
    () => Array.from(new Set((wishes ?? []).map((w) => w.ownerName))).sort(),
    [wishes],
  );

  const visible = useMemo(
    () =>
      (wishes ?? [])
        .filter((w) => person === "all" || w.ownerName === person)
        .filter((w) => showDropped || w.status !== "dropped"),
    [wishes, person, showDropped],
  );

  if (wishes === undefined) return <p className="lede">טוען…</p>;

  return (
    <div className="wish-board">
      <div className="section-head with-action" style={{ marginBottom: 0 }}>
        <p className="lede" style={{ margin: 0 }}>
          {visible.length} דברים ברשימה. מה שמסומן ״רק אני״ לא מופיע אצל אף אחד אחר.
        </p>
        <div className="wish-add-actions">
          <button className="btn btn-primary" type="button" onClick={() => { setAsking((v) => !v); setAdding(false); }}>
            <Sparkles size={16} />
            {asking ? "סגירה" : "לבקש מ־eve"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => { setAdding((v) => !v); setAsking(false); }}>
            <Plus size={16} />
            {adding ? "סגירה" : "להוסיף ידנית"}
          </button>
        </div>
      </div>

      {asking ? <AskEveForm onDone={() => setAsking(false)} /> : null}
      {adding ? <AddWishForm onDone={() => setAdding(false)} /> : null}

      <div className="wish-filters">
        <button
          type="button"
          className={`chip ${person === "all" ? "chip-day" : ""}`}
          onClick={() => setPerson("all")}
        >
          כולם
        </button>
        {people.map((name) => (
          <button
            type="button"
            key={name}
            className={`chip ${person === name ? "chip-day" : ""}`}
            onClick={() => setPerson(name)}
          >
            {name}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          onClick={() => setShowDropped((v) => !v)}
        >
          {showDropped ? <EyeOff size={12} /> : <Eye size={12} />}
          {showDropped ? "להסתיר ירדו" : "להציג ירדו"}
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="lede">אין עדיין כלום. מי שרוצה משהו — שיוסיף.</p>
      ) : (
        <div className="wish-grid">
          {visible.map((wish) => (
            <WishCard wish={wish} key={wish.id} />
          ))}
        </div>
      )}
    </div>
  );
}

export function WishBoard() {
  return (
    <>
      <AuthLoading>
        <p className="lede">בודק כניסה…</p>
      </AuthLoading>

      <Unauthenticated>
        <div className="card" style={{ padding: 24, display: "grid", gap: 14, justifyItems: "start" }}>
          <span className="chip">
            <Lock size={13} />
            רק למשפחה
          </span>
          <p className="lede" style={{ margin: 0 }}>
            הרשימות הן של המשפחה בלבד. צריך להתחבר כדי לראות אותן ולהוסיף.
          </p>
          <Link className="btn btn-primary" href="/sign-in">
            כניסה
          </Link>
        </div>
      </Unauthenticated>

      <Authenticated>
        <div className="wish-signed-in">
          <UserButton />
        </div>
        <Board />
      </Authenticated>
    </>
  );
}
