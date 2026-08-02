import { getToolName, isToolUIPart } from "ai";
import type { UIMessage } from "ai";

/**
 * Turns a streaming tool-call part into a short Hebrew progress line, so the
 * family can see what the agent is doing instead of staring at a spinner.
 */

const GUIDE_LABELS: Record<string, string> = {
  "00-OVERVIEW.md": "תמונת המצב",
  "01-FLIGHTS.md": "מדריך הטיסות",
  "02-ACCOMMODATION.md": "מדריך הלינה",
  "03-TRANSPORT.md": "מדריך התחבורה",
  "04-ANIME-POKEMON-GHIBLI.md": "מדריך האנימה והפוקימון",
  "05-FOOD-GUIDE.md": "מדריך האוכל",
  "06-DAY-TRIPS.md": "מדריך הטיולים",
  "07-BAR-MITZVAH.md": "מדריך בר המצווה",
  "08-PRACTICAL-TIPS.md": "הטיפים הפרקטיים",
  "09-DAILY-ITINERARY.md": "המסלול היומי",
  "10-BUDGET.md": "מדריך התקציב",
  "11-PRE-TRIP-CHECKLIST.md": "רשימת ההכנות",
};

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
export function toolStatusLabel(toolName: string, input: AnyInput): string {
  const name = normalizeToolName(toolName);

  switch (name) {
    /* ------------------------------------------------ the trip's own content */

    case "readGuide": {
      const file = pickString(input, ["file", "guide", "name", "slug"]);
      const label = file ? (GUIDE_LABELS[file] ?? GUIDE_LABELS[`${file}.md`]) : undefined;
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
      const file = pickString(input, ["file"]);
      const label = file ? (GUIDE_LABELS[file] ?? GUIDE_LABELS[`${file}.md`]) : undefined;
      return label ? `מכין הצעת עדכון ל${label}` : FALLBACKS.editPlanDoc;
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
