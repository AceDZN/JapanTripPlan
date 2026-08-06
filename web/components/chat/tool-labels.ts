import { getToolName, isToolUIPart } from "ai";
import type { UIMessage } from "ai";

/**
 * Turns a streaming tool-call part into a short Hebrew progress line, so the
 * family can see what the agent is doing instead of staring at a spinner.
 */

/**
 * `09-DAILY-ITINERARY.md` -> `המסלול היומי`, from Convex.
 *
 * This used to be a hand-written map of all twelve titles. By the time it was
 * replaced, ELEVEN of the twelve disagreed with `guides.titleHe`: the chat was
 * saying "קורא את מדריך האוכל" about a guide Convex calls "ראמן ואוכל", and —
 * worse — the approval card for a plan change was headed "להציע שינוי במדריך
 * האוכל", asking the family to approve an edit to a document under a name that
 * no longer exists anywhere else in the app.
 *
 * Callers pass the live index (`api.trip.listGuides`). An empty map is a valid
 * argument and means "not loaded yet": labels fall back to the generic status
 * line for the moment before the query resolves, which is what they already did
 * before a tool's input had streamed.
 */
export type GuideTitles = Record<string, string>;

/** Build the lookup from whatever `listGuides` returned (or nothing yet). */
export function guideTitles(
  guides: readonly { file: string; title: string }[] | undefined,
): GuideTitles {
  return Object.fromEntries((guides ?? []).map((guide) => [guide.file, guide.title]));
}

/** Tolerates both `05-FOOD-GUIDE` and `05-FOOD-GUIDE.md`, as the tools send both. */
function titleOf(titles: GuideTitles, file: string | undefined): string | undefined {
  if (!file) return undefined;
  return titles[file] ?? titles[`${file}.md`];
}

/**
 * What each tool is doing, when its input has not streamed yet (or carries
 * nothing worth naming). Every tool the agent actually has needs an entry:
 * anything that falls through to `עובד על זה` reads as a stalled spinner, and
 * nine of them in a row read as a broken one.
 */
const FALLBACKS: Record<string, string> = {
  // trip content
  readGuide: "קורא במדריכים",
  getDay: "בודק את לוח הימים",
  getNow: "בודק את השעה ביפן",
  searchPlaces: "מחפש בין המקומות של הטיול",
  nearbyPlaces: "מחשב מה יש בסביבה",
  // the open web
  webSearch: "מחפש ברשת",
  webFetch: "קורא דף באינטרנט",
  // wishes and research
  listWishes: "עובר על רשימת המשאלות",
  createWish: "מוסיף לרשימת המשאלות",
  researchWish: "רושם את הממצאים על המשאלה",
  queueBackgroundResearch: "מעביר את המחקר לרקע",
  deliverBackgroundResult: "חוזר עם תוצאות הבדיקה",
  // the plan, the checklist and the money
  editPlanDoc: "מכין הצעת עדכון לתוכנית",
  editContent: "מעדכן את פרטי הטיול",
  searchImage: "מחפש תמונות",
  setImage: "שומר את התמונה",
  listSuggestions: "בודק אילו הצעות ממתינות",
  markDone: "מעדכן את רשימת ההכנות",
  moneyReport: "מסכם את ההוצאות",
  recordSpend: "רושם הוצאה",
  setPrice: "מעדכן את התקציב",
  // AI SDK transport only
  getChecklist: "עובר על רשימת ההכנות",
  getBookingGates: "בודק מה עוד לא הוזמן",
  // eve framework tools
  todo: "מסדר את סדר הפעולות",
  loadSkill: "טוען מיומנות",
  askQuestion: "מנסח שאלה אליך",
};

/** Last resort: a tool nobody has taught this file about yet. */
export const GENERIC_STATUS = "עובד על זה";

/** What `edit_content` is pointing at, named as a person would name it. */
const CONTENT_TARGETS: Record<string, string> = {
  places: "מקום",
  days: "יום בטיול",
  blocks: "בלוק בתוכנית",
  checklistItems: "משימה ברשימת ההכנות",
};

type AnyInput = Record<string, unknown> | undefined;

/**
 * Normalizes a tool name to the camelCase keys used here.
 *
 * The AI SDK agent exposes `readGuide`; the eve agent names the same tool
 * `read_guide`. Both transports render the same Hebrew status line.
 */
function normalizeToolName(toolName: string): string {
  return toolName.replace(/[-_]([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/** First string-valued key that is present, so both tool schemas are covered. */
function pickString(input: AnyInput, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input?.[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

/** First number-valued key that is present, tolerating a numeric string. */
function pickNumber(input: AnyInput, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = input?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

/**
 * Longest a quoted fragment may be inside a status line.
 *
 * A search query or a checklist item can be a whole sentence, and a status line
 * that wraps to three rows stops reading as a status line.
 */
const QUOTE_MAX = 34;

/** Quotes a fragment of the tool's input, trimmed to one line's worth. */
function quote(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return `״${clean.length > QUOTE_MAX ? `${clean.slice(0, QUOTE_MAX - 1)}…` : clean}״`;
}

/** The site being read, as a person would name it — `www.` and path dropped. */
function hostOf(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || undefined;
  } catch {
    return undefined;
  }
}

/** Human label for one tool call, using its input when it has already streamed. */
export function toolStatusLabel(
  toolName: string,
  input: AnyInput,
  titles: GuideTitles = {},
): string {
  const name = normalizeToolName(toolName);

  switch (name) {
    /* ------------------------------------------------ the trip's own content */

    case "readGuide": {
      const label = titleOf(titles, pickString(input, ["file", "guide", "name", "slug"]));
      return label ? `קורא את ${label}` : FALLBACKS.readGuide;
    }
    case "getDay": {
      const day = pickNumber(input, ["day", "dayN", "dayNumber"]);
      return day && day > 0 ? `בודק את יום ${day}` : FALLBACKS.getDay;
    }
    case "searchPlaces": {
      const query = pickString(input, ["query", "q", "text"]);
      return query ? `מחפש ${quote(query)} בין המקומות` : FALLBACKS.searchPlaces;
    }

    /* -------------------------------------------------------- the open web */

    case "webSearch": {
      const queries = Array.isArray(input?.queries) ? input.queries : undefined;
      const first = queries?.find((item): item is string => typeof item === "string" && !!item.trim());
      const query = pickString(input, ["query", "q", "search"]) ?? first;
      return query ? `מחפש ברשת ${quote(query)}` : FALLBACKS.webSearch;
    }
    case "webFetch": {
      const url = pickString(input, ["url", "uri", "link"]);
      const host = url ? hostOf(url) : undefined;
      return host ? `קורא ב־${host}` : FALLBACKS.webFetch;
    }

    /* -------------------------------------------------- wishes and research */

    case "createWish": {
      const title = pickString(input, ["title", "titleEn", "titleJa"]);
      return title ? `מוסיף ${quote(title)} לרשימת המשאלות` : FALLBACKS.createWish;
    }
    case "queueBackgroundResearch": {
      const topic = pickString(input, ["topic", "promptText"]);
      return topic ? `שולח לבדיקה ברקע: ${quote(topic)}` : FALLBACKS.queueBackgroundResearch;
    }
    case "deliverBackgroundResult": {
      const topic = pickString(input, ["topic"]);
      return topic ? `חוזר עם מה שמצא על ${quote(topic)}` : FALLBACKS.deliverBackgroundResult;
    }

    /* ---------------------------------- the plan, the checklist, the money */

    case "editPlanDoc": {
      const label = titleOf(titles, pickString(input, ["file"]));
      return label ? `מכין הצעת עדכון ל${label}` : FALLBACKS.editPlanDoc;
    }
    case "searchImage": {
      const query = pickString(input, ["query"]);
      return query ? `מחפש תמונות של ${quote(query)}` : FALLBACKS.searchImage;
    }
    case "setImage": {
      const table = pickString(input, ["table"]);
      const target = table ? CONTENT_TARGETS[table] : undefined;
      const slot = pickString(input, ["slot"]);
      if (!target) return FALLBACKS.setImage;
      return slot === "gallery" ? `מוסיף תמונה לגלריה של ${target}` : `מחליף את התמונה של ${target}`;
    }
    case "editContent": {
      const table = pickString(input, ["table"]);
      const key = pickString(input, ["key"]);
      const target = table ? CONTENT_TARGETS[table] : undefined;
      if (!target) return FALLBACKS.editContent;
      return key ? `מעדכן ${target} — ${quote(key)}` : `מעדכן ${target}`;
    }
    case "markDone": {
      const item = pickString(input, ["item_text", "itemText", "text"]);
      const reopening = input?.done === false;
      if (!item) return FALLBACKS.markDone;
      return reopening ? `פותח מחדש את ${quote(item)}` : `מסמן ${quote(item)} כבוצע`;
    }
    case "moneyReport": {
      const day = pickNumber(input, ["dayN", "day"]);
      return day && day > 0 ? `מסכם את ההוצאות של יום ${day}` : FALLBACKS.moneyReport;
    }
    case "recordSpend": {
      const title = pickString(input, ["title", "titleEn"]);
      return title ? `רושם הוצאה: ${quote(title)}` : FALLBACKS.recordSpend;
    }

    /* --------------------------------------------------- eve framework tools */

    case "loadSkill": {
      const skill = pickString(input, ["skill", "name", "id"]);
      return skill ? `טוען את המיומנות ${quote(skill)}` : FALLBACKS.loadSkill;
    }

    default:
      // Everything else is a fixed line — its input adds nothing a person needs.
      return FALLBACKS[name] ?? GENERIC_STATUS;
  }
}

export type ToolActivity = {
  id: string;
  label: string;
  done: boolean;
};

/** Extracts every tool call in a message, in order, as displayable activity. */
export function toolActivity(message: UIMessage): ToolActivity[] {
  const activity: ToolActivity[] = [];

  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue;

    const name = getToolName(part);
    const input =
      part.state === "input-available" || part.state === "output-available"
        ? (part.input as AnyInput)
        : undefined;

    activity.push({
      id: part.toolCallId,
      label: toolStatusLabel(name, input),
      done: part.state === "output-available" || part.state === "output-error",
    });
  }

  return activity;
}

/** Concatenated assistant text across all text parts of a message. */
export function messageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

/* ==================================================== approval card copy */

/**
 * Hebrew copy for a pending tool approval.
 *
 * eve writes the prompt itself, and what it writes is `Approve tool call:
 * edit_plan_doc` — accurate, English, and useless to the family. It names the
 * function rather than the act, and says nothing about *what* is being changed,
 * so the only honest answer to it is "approve what?".
 *
 * The request carries the tool call's actual input, though, so the card can be
 * written from that instead: a title saying what will happen, and the specific
 * details of this call. Only the four tools that are actually gated
 * (`approval: always()` in trip-agent/agent/tools) need an entry; anything else
 * gated later falls back to naming the tool, which is still no worse than eve's
 * own wording.
 */

export type ApprovalCopy = {
  /** What the family is being asked to allow, as a sentence. */
  title: string;
  /** The specifics of this call — one `label: value` row each. */
  details: { label: string; value: string }[];
  /** Wording for the confirm button, matched to the act. */
  confirm: string;
};

function text(input: AnyInput, key: string): string | undefined {
  const value = input?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function number(input: AnyInput, key: string): number | undefined {
  const value = input?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * Longest a quoted fragment may run inside a card row.
 *
 * Generous compared to the status lines in tool-labels — this is the one moment
 * the family is being asked to *decide*, so an edit truncated past the point of
 * recognition would be asking them to approve something they cannot see.
 */
const VALUE_MAX = 180;

function clip(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > VALUE_MAX ? `${clean.slice(0, VALUE_MAX - 1)}…` : clean;
}

/** The guide's Hebrew title, falling back to the filename it was called by. */
function guideLabel(titles: GuideTitles, file: string | undefined): string | undefined {
  return file ? (titleOf(titles, file) ?? file) : undefined;
}

const MONEY = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 });

export function approvalCopy(
  toolName: string | undefined,
  input: AnyInput,
  titles: GuideTitles = {},
): ApprovalCopy {
  switch (toolName ? normalizeToolName(toolName) : "") {
    case "sessionLimitContinuation":
      // Legacy durable sessions may still carry the finite token budget from
      // the deployment that created them. New sessions are uncapped, but an
      // old one needs one final continuation response before it can resume.
      return {
        title: "השיחה ארוכה — להמשיך מאותה נקודה?",
        details: [],
        confirm: "להמשיך בשיחה",
      };

    case "editPlanDoc": {
      const guide = guideLabel(titles, text(input, "file"));
      const details: ApprovalCopy["details"] = [];
      const summary = text(input, "summary");
      const rationale = text(input, "rationale");
      const before = text(input, "old_string") ?? text(input, "oldString");
      const after = text(input, "new_string") ?? text(input, "newString");

      if (summary) details.push({ label: "השינוי", value: clip(summary) });
      if (rationale) details.push({ label: "למה", value: clip(rationale) });
      if (before) details.push({ label: "במקום", value: clip(before) });
      // An empty `new_string` is a deletion, and saying so beats an empty row.
      details.push({
        label: "יהיה",
        value: after ? clip(after) : "(הטקסט יימחק)",
      });

      return {
        title: guide ? `להציע שינוי ב${guide}` : "להציע שינוי בתוכנית",
        details,
        // The tool only ever files a suggestion — promising more would be a lie
        // the family finds out about when the plan does not change.
        confirm: "שליחה לאישור",
      };
    }

    case "markDone": {
      const item = text(input, "item_text") ?? text(input, "itemText");
      const reopening = input?.done === false;
      return {
        title: reopening ? "לפתוח מחדש פריט ברשימת ההכנות" : "לסמן פריט ברשימת ההכנות כבוצע",
        details: item ? [{ label: "הפריט", value: clip(item) }] : [],
        confirm: reopening ? "פתיחה מחדש" : "סימון כבוצע",
      };
    }

    case "recordSpend": {
      const title = text(input, "title") ?? text(input, "titleEn");
      const amount = number(input, "amount");
      const currency = text(input, "currency");
      const day = number(input, "dayN");
      const pending = text(input, "status") === "pending";

      const details: ApprovalCopy["details"] = [];
      if (title) details.push({ label: "על מה", value: clip(title) });
      if (amount !== undefined) {
        details.push({
          label: "סכום",
          value: `${MONEY.format(amount)}${currency ? ` ${currency}` : ""}`,
        });
      }
      if (day !== undefined) details.push({ label: "יום", value: `יום ${day}` });
      if (pending) details.push({ label: "סטטוס", value: "טרם שולם" });

      return { title: "לרשום הוצאה בפנקס", details, confirm: "רישום ההוצאה" };
    }

    case "editContent": {
      const table = text(input, "table");
      const op = text(input, "op");
      const key = text(input, "key");
      const rationale = text(input, "rationale");
      const fields = input?.fields;
      const unset = Array.isArray(input?.unset) ? (input.unset as string[]) : [];

      const names = [
        ...(fields && typeof fields === "object" && !Array.isArray(fields)
          ? Object.keys(fields as Record<string, unknown>)
          : []),
        ...unset,
      ];

      const details: ApprovalCopy["details"] = [];
      const what = CONTENT_TARGETS[table ?? ""] ?? "פרט בטיול";
      if (key) details.push({ label: what, value: clip(key) });
      if (names.length > 0) details.push({ label: "שדות", value: clip(names.join(", ")) });
      if (unset.length > 0) details.push({ label: "לנקות", value: clip(unset.join(", ")) });
      if (rationale) details.push({ label: "למה", value: clip(rationale) });

      // Deliberately does NOT try to predict which half applies and which
      // queues. That split is computed server-side from the field names
      // (`convex/lib/contentPolicy.ts`), and a second copy of the rule here
      // would eventually disagree with it — on this card, at the one moment
      // somebody is being asked to trust what it says.
      details.push({
        label: "מה יקרה",
        value:
          op === "create" || op === "delete"
            ? "הוספה או הסרה תמיד עוברת לאישור של אלכס"
            : "תיקון עובדתי נשמר מיד; שינוי בתוכנית עצמה עובר לאישור של אלכס",
      });

      return {
        title:
          op === "create"
            ? `להציע הוספה של ${what}`
            : op === "delete"
              ? `להציע הסרה של ${what}`
              : `לעדכן ${what}`,
        details,
        confirm: "עדכון",
      };
    }

    case "setImage": {
      const table = text(input, "table");
      const slot = text(input, "slot");
      const key = text(input, "key");
      const alt = text(input, "alt");
      const url = text(input, "url");

      const details: ApprovalCopy["details"] = [];
      const what = CONTENT_TARGETS[table ?? ""] ?? "פריט בטיול";
      if (key) details.push({ label: what, value: clip(key) });
      if (alt) details.push({ label: "מה רואים", value: clip(alt) });
      // The source host, not the whole URL — nobody reviews a 200-character
      // CDN link, but "is this coming from the shop's own site" is answerable.
      if (url) {
        try {
          details.push({ label: "מקור", value: new URL(url).hostname.replace(/^www\./, "") });
        } catch {
          details.push({ label: "מקור", value: clip(url) });
        }
      }
      details.push({
        label: "מה יקרה",
        value:
          slot === "gallery"
            ? "התמונה תישמר ותתווסף לגלריה — נכנס מיד"
            : "התמונה תישמר ותחליף את הראשית — נכנס מיד",
      });

      return {
        title: slot === "gallery" ? `להוסיף תמונה ל${what}` : `להחליף את התמונה של ${what}`,
        details,
        confirm: "שמירת התמונה",
      };
    }

    case "setPrice": {
      const target = text(input, "target");
      const min = number(input, "minYen");
      const max = number(input, "maxYen");
      const details: ApprovalCopy["details"] = [];

      const what =
        text(input, "blockTitle") ?? text(input, "label") ?? text(input, "slug") ?? undefined;
      if (what) details.push({ label: "מה", value: clip(what) });

      const day = number(input, "dayN");
      if (day !== undefined) details.push({ label: "יום", value: `יום ${day}` });

      if (input?.removeLine === true) {
        details.push({ label: "פעולה", value: "מחיקת שורת העלות" });
      } else if (min !== undefined || max !== undefined) {
        const range =
          min !== undefined && max !== undefined && min !== max
            ? `${MONEY.format(min)}–${MONEY.format(max)} ¥`
            : `${MONEY.format(max ?? min ?? 0)} ¥`;
        details.push({ label: "סכום", value: range });
      }

      const basis = text(input, "basis");
      if (basis) details.push({ label: "לפי מה", value: clip(basis) });

      return {
        title:
          target === "envelope"
            ? "לעדכן מעטפת תקציב"
            : target === "wish"
              ? "לעדכן מחיר של משאלה"
              : "לעדכן מחיר בתוכנית",
        details,
        confirm: "עדכון",
      };
    }

    default:
      return {
        title: toolName ? `לאשר פעולה: ${toolName}` : "לאשר פעולה",
        details: [],
        confirm: "אישור",
      };
  }
}
