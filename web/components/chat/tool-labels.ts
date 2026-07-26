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

const FALLBACKS: Record<string, string> = {
  readGuide: "קורא במדריכים",
  getDay: "בודק את לוח הימים",
  searchPlaces: "מחפש מקומות",
  getChecklist: "עובר על רשימת ההכנות",
  getBookingGates: "בודק מה עוד לא הוזמן",
  nearbyPlaces: "מחשב מה יש בסביבה",
};

type AnyInput = Record<string, unknown> | undefined;

/** Human label for one tool call, using its input when it has already streamed. */
export function toolStatusLabel(toolName: string, input: AnyInput): string {
  switch (toolName) {
    case "readGuide": {
      const file = typeof input?.file === "string" ? input.file : undefined;
      const label = file ? GUIDE_LABELS[file] : undefined;
      return label ? `קורא את ${label}` : FALLBACKS.readGuide;
    }
    case "getDay": {
      const day = typeof input?.day === "number" ? input.day : undefined;
      return day ? `בודק את יום ${day}` : FALLBACKS.getDay;
    }
    case "searchPlaces": {
      const query = typeof input?.query === "string" ? input.query.trim() : "";
      return query ? `מחפש ״${query}״` : FALLBACKS.searchPlaces;
    }
    case "getChecklist":
      return FALLBACKS.getChecklist;
    case "getBookingGates":
      return FALLBACKS.getBookingGates;
    case "nearbyPlaces":
      return FALLBACKS.nearbyPlaces;
    default:
      return "עובד על זה";
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
