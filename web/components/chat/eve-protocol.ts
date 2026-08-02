/**
 * Pure projection of the eve NDJSON session stream into render-ready chat state.
 *
 * Deliberately import-free: `node --test` loads this file directly (Node type
 * stripping) so the wire contract can be asserted without a bundler, and the
 * React layer stays a thin shell around it.
 *
 * Contract sources (authoritative, read from the installed package):
 *   - eve/docs/concepts/sessions-runs-and-streaming.md  — event list, finishReason
 *     guidance, continuationToken, reconnect via `startIndex`
 *   - eve/docs/channels/eve.mdx                          — routes + NDJSON framing
 *   - eve/dist/src/protocol/message.d.ts                 — event payload shapes
 *     (stream format "ndjson", version 19)
 */

/** One line of the NDJSON stream. */
export type EveEvent = {
  readonly type: string;
  readonly data?: Record<string, unknown>;
};

/** A tool/skill/subagent call rendered as a Hebrew status line. */
export type EveActivity = {
  id: string;
  label: string;
  done: boolean;
};

/** A file the family attached, as the bubble needs to draw it. */
export type BubbleAttachment = {
  id: string;
  kind: "image" | "pdf" | "text";
  name: string;
  mediaType: string;
  /** Renderable source for an image thumbnail, when the stream carried one. */
  url?: string;
};

/** One rendered bubble. Shared shape with the AI SDK fallback transport. */
export type EveBubble = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /**
   * The turn was spoken rather than typed. `text` is what the listening model
   * heard, and the recording itself is played back from the device — see
   * voice-store.ts.
   */
  audio: boolean;
  attachments: BubbleAttachment[];
  activity: EveActivity[];
  streaming: boolean;
  /** Assistant text reached its terminal `message.completed` (safe to speak). */
  final: boolean;
};

export type EveStatus = "idle" | "streaming" | "waiting" | "completed" | "failed";

export type EveState = {
  messages: EveBubble[];
  /** Channel-owned resume handle, captured from `session.waiting`. */
  continuationToken: string | null;
  status: EveStatus;
  error: string | null;
  /**
   * The last turn died on the agent side and the session parked for retry, so
   * the error card can offer to re-send the question.
   */
  retryable: boolean;
  /** Absolute count of events consumed — the reconnect `startIndex`. */
  cursor: number;
  /** How many `message.received` events landed; drops optimistic bubbles. */
  received: number;
};

export type LabelFn = (toolName: string, input: Record<string, unknown> | undefined) => string;

/** Fallback bubble text when a voice turn produced no words at all. */
export const VOICE_BUBBLE_LABEL = "🎤 הודעה קולית";

/* -------------------------------------------------- outbound context part */

/**
 * Every outgoing turn leads with a metadata text part telling the agent when
 * and where the family is:
 *
 *   [הקשר: 2026-10-05T14:32:10+09:00; מיקום: 35.65858,139.74543 דיוק 18מ׳]
 *
 * The trip-agent instructions treat this exact bracketed prefix as trusted
 * context (not as something the user typed), and the chat never renders it —
 * see `isContextPart` / `stripContextLines`, applied to both optimistic
 * bubbles and `message.received` replay.
 */
export const CONTEXT_PREFIX = "[הקשר:";

/**
 * Clause added to the context part when the turn was spoken.
 *
 * A voice note cannot reach the model as audio on this transport (eve's
 * attachment staging only re-inlines images and PDFs), so an audio-native model
 * listens first and its words are what the agent receives. This marker is how
 * the agent is told those words were *heard*, not typed — so it can forgive a
 * mangled place name instead of taking the transcript literally. The chat never
 * renders the context part, so the family never sees it.
 */
export const VOICE_CONTEXT_CLAUSE = "קלט: הודעה קולית מתומללת";

/**
 * Marker opening a background run's report back into the originating session.
 *
 * Deferred research (`queue_background_research`) finishes long after the turn
 * that asked for it, and the only way eve can push into a parked session is a
 * follow-up on its continuation token — which lands as a **user-role** message.
 * So the transcript contains a message the family never typed, addressed to the
 * agent rather than to them.
 *
 * It is machine-to-machine payload, so the bubble is suppressed entirely rather
 * than stripped down to a blank one: `visibleMessages` keeps every user bubble
 * unconditionally, and an empty one would render as a mystery gap right where
 * the answer is supposed to appear. The agent's reply to it renders normally —
 * that reply is the whole point.
 */
export const BACKGROUND_UPDATE_PREFIX = "[עדכון-רקע]";

/** True for a background run's report — never shown, never treated as a send. */
export function isBackgroundUpdate(text: string): boolean {
  return text.trimStart().startsWith(BACKGROUND_UPDATE_PREFIX);
}

/** During the trip the family reads clocks in Japan, not at home. */
const TRIP_TIME_ZONE = "Asia/Tokyo";
/** Mirrors lib/trip-data.ts, extended to the Oct 18 flight home. */
const TRIP_FIRST_DAY = "2026-10-01";
const TRIP_LAST_DAY = "2026-10-18";

/** A cached position older than this is refreshed before the next send. */
export const GEO_FRESH_MS = 5 * 60_000;

export type GeoFix = {
  lat: number;
  lng: number;
  /** Radius in metres, as reported by the device. */
  accuracy: number;
  /** Epoch ms when the fix was taken. */
  at: number;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Minutes east of UTC for `date` in `timeZone` (handles DST correctly). */
function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );

  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** ISO-8601 local time with an explicit offset, e.g. 2026-10-05T14:32:10+09:00. */
export function isoWithOffset(date: Date, timeZone?: string): string {
  const offset = timeZone ? zoneOffsetMinutes(date, timeZone) : -date.getTimezoneOffset();
  const stamp = new Date(date.getTime() + offset * 60_000).toISOString().slice(0, 19);
  const abs = Math.abs(offset);
  return `${stamp}${offset < 0 ? "-" : "+"}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/** Asia/Tokyo while the trip is running, otherwise the device's own zone. */
export function contextTimeZone(now: Date): string | undefined {
  try {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: TRIP_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    return key >= TRIP_FIRST_DAY && key <= TRIP_LAST_DAY ? TRIP_TIME_ZONE : undefined;
  } catch {
    return undefined;
  }
}

/** True while a cached fix is still worth reusing instead of re-asking the GPS. */
export function isFreshFix(fix: GeoFix | null | undefined, now = Date.now()): boolean {
  return Boolean(fix) && now - fix!.at < GEO_FRESH_MS;
}

/**
 * Builds the context part. The time clause is always present; the location
 * clause is omitted whenever sharing is off, denied, or unavailable.
 */
export function buildContextLine(
  input: { now?: Date; location?: GeoFix | null; voice?: boolean } = {},
): string {
  const now = input.now ?? new Date();
  const stamp = isoWithOffset(now, contextTimeZone(now));
  const fix = input.location;

  const where = fix
    ? `; מיקום: ${fix.lat.toFixed(5)},${fix.lng.toFixed(5)} דיוק ${Math.round(fix.accuracy)}מ׳`
    : "";
  const spoken = input.voice ? `; ${VOICE_CONTEXT_CLAUSE}` : "";

  return `${CONTEXT_PREFIX} ${stamp}${where}${spoken}]`;
}

/** True when a text part is client-injected metadata rather than user words. */
export function isContextPart(text: string): boolean {
  return text.trimStart().startsWith(CONTEXT_PREFIX);
}

/** A line that is nothing but context metadata. */
const CONTEXT_WHOLE_LINE = /^\s*\[הקשר:[^\]]*\]\s*$/;
/** Context metadata sitting in front of the user's words on the same line. */
const CONTEXT_LEADING = /^\s*\[הקשר:[^\]]*\]\s*/;

/**
 * Removes context metadata from a flattened message body — used for the
 * `message.received` compatibility summary (where eve joins the parts) and for
 * the AI SDK fallback (where the line rides inside the message text).
 */
export function stripContextLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !CONTEXT_WHOLE_LINE.test(line))
    .join("\n")
    .replace(CONTEXT_LEADING, "")
    .trim();
}

/** Text part that rides along when a voice note produced no words at all. */
export const VOICE_TEXT_PART = "(הודעה קולית)";

/**
 * How an attached text file reaches the model.
 *
 * Nothing on either transport reads a `.txt`/`.csv`/`.json` attachment — eve
 * turns it into a sandbox path the concierge has no tools to open — so the
 * contents are inlined as words instead, inside this fence. The chat lifts the
 * fence back out into a file chip rather than dumping the file into the bubble.
 */
export const FILE_TEXT_OPEN = "--- תוכן הקובץ המצורף";
export const FILE_TEXT_CLOSE = "--- סוף הקובץ ---";

/** Matches one inlined text attachment, capturing its filename. */
const FILE_TEXT_BLOCK = /--- תוכן הקובץ המצורף "([^"]*)" ---\n[\s\S]*?\n--- סוף הקובץ ---/g;

export const EVE_INITIAL_STATE: EveState = {
  messages: [],
  continuationToken: null,
  status: "idle",
  error: null,
  retryable: false,
  cursor: 0,
  received: 0,
};

/* ------------------------------------------------------------------ helpers */

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function assistantId(turnId: string | undefined): string {
  return `assistant:${turnId ?? "turn"}`;
}

/**
 * Returns a new message list with the current turn's assistant bubble created
 * (if needed) and passed through `mutate`. The bubble is created lazily — never
 * on `turn.started` — so `message.received` always lands above it.
 */
function withAssistant(
  state: EveState,
  turnId: string | undefined,
  mutate: (bubble: EveBubble) => void,
): EveBubble[] {
  const id = assistantId(turnId);
  const messages = state.messages.slice();
  let index = messages.findIndex((message) => message.id === id);

  if (index === -1) {
    messages.push({
      id,
      role: "assistant",
      text: "",
      audio: false,
      attachments: [],
      activity: [],
      streaming: true,
      final: false,
    });
    index = messages.length - 1;
  }

  const next: EveBubble = { ...messages[index], activity: messages[index].activity.slice() };
  mutate(next);
  messages[index] = next;
  return messages;
}

/** Marks every bubble settled — used at turn and session boundaries. */
function settle(messages: EveBubble[]): EveBubble[] {
  return messages.map((message) => (message.streaming ? { ...message, streaming: false } : message));
}

function markDone(messages: EveBubble[], callId: string | undefined): EveBubble[] {
  if (!callId) return messages;

  return messages.map((message) => {
    const at = message.activity.findIndex((item) => item.id === callId && !item.done);
    if (at === -1) return message;

    const activity = message.activity.slice();
    activity[at] = { ...activity[at], done: true };
    return { ...message, activity };
  });
}

/** Hebrew label for one requested action, whatever its kind. */
function actionLabel(action: Record<string, unknown>, label: LabelFn | undefined): string {
  const kind = str(action.kind);

  if (kind === "load-skill") return "טוען מיומנות";
  if (kind === "subagent-call" || kind === "remote-agent-call") {
    const name = str(action.name) ?? str(action.subagentName) ?? str(action.remoteAgentName);
    return name ? `נעזר ב־${name}` : "נעזר בסוכן משנה";
  }

  const toolName = str(action.toolName) ?? "";
  const input = record(action.input);
  if (label) return label(toolName, input);
  return toolName || "עובד על זה";
}

/** Classifies a file part by media type, or `null` when it is not renderable. */
function attachmentKind(mediaType: string): BubbleAttachment["kind"] | null {
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType === "application/pdf") return "pdf";
  return null;
}

/**
 * Lifts inlined text attachments out of the message body.
 *
 * The whole file was sent as words, which is right for the model and very wrong
 * for a chat bubble — so the fence is replaced by a chip and the body keeps only
 * what the family actually wrote.
 */
export function extractTextAttachments(text: string): {
  text: string;
  attachments: BubbleAttachment[];
} {
  if (!text.includes(FILE_TEXT_OPEN)) return { text, attachments: [] };

  const attachments: BubbleAttachment[] = [];
  let index = 0;

  const stripped = text.replace(FILE_TEXT_BLOCK, (_match, name: string) => {
    index += 1;
    attachments.push({
      id: `text:${index}:${name}`,
      kind: "text",
      name: name || "קובץ טקסט",
      mediaType: "text/plain",
    });
    return "";
  });

  return { text: stripped.replace(/\n{3,}/g, "\n\n").trim(), attachments };
}

/** Reads the structured user message, preferring `parts` over the flat summary. */
export function readUserMessage(data: Record<string, unknown> | undefined): {
  text: string;
  audio: boolean;
  attachments: BubbleAttachment[];
} {
  const parts = Array.isArray(data?.parts) ? (data.parts as unknown[]) : [];
  const attachments: BubbleAttachment[] = [];
  let text = "";
  let audio = false;

  for (const raw of parts) {
    const part = record(raw);
    if (!part) continue;

    if (part.type === "text") {
      const value = str(part.text) ?? "";
      // The leading context part is ours, not the user's — never rendered, but
      // it is where "this turn was spoken" is recorded.
      if (isContextPart(value)) {
        if (value.includes(VOICE_CONTEXT_CLAUSE)) audio = true;
        continue;
      }
      text += value;
    } else if (part.type === "file") {
      const mediaType = str(part.mediaType) ?? "";
      // Sessions recorded before the listening step still carry raw audio parts.
      if (mediaType.startsWith("audio/")) {
        audio = true;
        continue;
      }

      const kind = attachmentKind(mediaType);
      if (!kind) continue;

      const name = str(part.filename) ?? (kind === "pdf" ? "מסמך.pdf" : "תמונה");
      attachments.push({
        id: `file:${attachments.length}:${name}`,
        kind,
        name,
        mediaType,
        // eve echoes the data URL back on the stream, so a rebuilt transcript
        // can still draw the thumbnail.
        url: str(part.url) ?? str(part.data),
      });
    }
  }

  if (parts.length === 0) text = str(data?.message) ?? "";
  // The flattened summary carries the context inline, marker included, so the
  // spoken flag is read before the context is stripped back out.
  if (text.includes(VOICE_CONTEXT_CLAUSE)) audio = true;

  const lifted = extractTextAttachments(stripContextLines(text));
  attachments.push(...lifted.attachments);
  text = lifted.text;

  if (audio && (!text || text === VOICE_TEXT_PART)) text = VOICE_BUBBLE_LABEL;

  return { text, audio, attachments };
}

/** What a transient upstream/model failure reads like. Paired with a retry button. */
export const AGENT_FAILURE_MESSAGE = "הסוכן נתקל בתקלה זמנית";

/**
 * Turns a failure payload into something a Hebrew-speaking family can act on.
 *
 * The default is deliberately the transient-upstream wording: a `turn.failed`
 * is by definition the agent side giving up, and the session parks afterwards
 * so the very next thing to try is simply asking again.
 */
export function failureMessage(data: Record<string, unknown> | undefined): string {
  const message = `${str(data?.code) ?? ""} ${str(data?.message) ?? ""}`;

  if (/quota|credit|payment|insufficient|balance/i.test(message)) {
    return "נגמר הקרדיט של הסוכן. אפשר לטעון עוד בלוח הבקרה.";
  }
  if (/rate.?limit|429|too many/i.test(message)) {
    return "יותר מדי בקשות כרגע. נסו שוב בעוד רגע.";
  }
  if (/api key|unauthor|forbidden|401|403/i.test(message)) {
    return "הסוכן דחה את הבקשה. בדקו את הגדרות החיבור (EVE_SHARED_SECRET).";
  }
  if (/timeout|timed out|abort/i.test(message)) {
    return "התשובה לקחה יותר מדי זמן. אפשר לנסות שוב.";
  }
  return AGENT_FAILURE_MESSAGE;
}

/* ------------------------------------------------------------------ reducer */

/**
 * Folds one stream event into the chat state. Every event advances `cursor`,
 * which is the absolute `startIndex` to reconnect from.
 */
export function reduceEve(state: EveState, event: EveEvent, label?: LabelFn): EveState {
  const data = event.data;
  const turnId = str(data?.turnId);
  const cursor = state.cursor + 1;
  const base = { ...state, cursor };

  switch (event.type) {
    case "session.started":
      return { ...base, error: null };

    case "turn.started":
      // No bubble yet — `message.received` must render above the answer.
      // A new turn is also what dismisses the previous turn's error card.
      return { ...base, status: "streaming", error: null, retryable: false };

    case "message.received": {
      const { text, audio, attachments } = readUserMessage(data);
      // A background run reporting in is not a family message: no bubble, and
      // `received` stays put so it cannot be mistaken for confirmation of an
      // optimistic send that happens to be in flight.
      if (isBackgroundUpdate(text)) return base;

      const id = `user:${turnId ?? "turn"}:${String(data?.sequence ?? state.received)}`;
      if (state.messages.some((message) => message.id === id)) return base;

      return {
        ...base,
        received: state.received + 1,
        messages: [
          ...state.messages,
          {
            id,
            role: "user",
            text,
            audio,
            attachments,
            activity: [],
            streaming: false,
            final: true,
          },
        ],
      };
    }

    case "actions.requested": {
      const actions = Array.isArray(data?.actions) ? (data.actions as unknown[]) : [];

      const messages = withAssistant(base, turnId, (bubble) => {
        for (const raw of actions) {
          const action = record(raw);
          const callId = action ? str(action.callId) : undefined;
          if (!action || !callId) continue;

          // Calls stream incrementally, so correlate by call id rather than
          // assuming one event carries every call of a step.
          const next = { id: callId, label: actionLabel(action, label), done: false };
          const at = bubble.activity.findIndex((item) => item.id === callId);
          if (at === -1) bubble.activity.push(next);
          else bubble.activity[at] = { ...bubble.activity[at], label: next.label };
        }
      });

      return { ...base, messages, status: "streaming" };
    }

    case "action.result":
      return { ...base, messages: markDone(base.messages, str(record(data?.result)?.callId)) };

    case "subagent.called":
      return {
        ...base,
        messages: withAssistant(base, turnId, (bubble) => {
          const callId = str(data?.callId);
          if (!callId || bubble.activity.some((item) => item.id === callId)) return;
          const name = str(data?.name);
          bubble.activity.push({
            id: callId,
            label: name ? `נעזר ב־${name}` : "נעזר בסוכן משנה",
            done: false,
          });
        }),
      };

    case "subagent.completed":
      return { ...base, messages: markDone(base.messages, str(data?.callId)) };

    case "message.appended": {
      const soFar = typeof data?.messageSoFar === "string" ? data.messageSoFar : undefined;
      const delta = typeof data?.messageDelta === "string" ? data.messageDelta : "";

      return {
        ...base,
        status: "streaming",
        messages: withAssistant(base, turnId, (bubble) => {
          bubble.text = soFar ?? bubble.text + delta;
          bubble.streaming = true;
        }),
      };
    }

    case "message.completed": {
      // `tool-calls` is the only non-terminal assistant step: that text is
      // narration before a tool call, so it is dropped rather than kept.
      const interim = data?.finishReason === "tool-calls";
      const message = typeof data?.message === "string" ? data.message : null;

      return {
        ...base,
        messages: withAssistant(base, turnId, (bubble) => {
          if (interim) {
            bubble.text = "";
            return;
          }
          if (message !== null) bubble.text = message;
          bubble.final = true;
          bubble.streaming = false;
        }),
      };
    }

    case "input.requested": {
      // Rendered as ordinary assistant text: a plain follow-up message answers
      // an `ask_question` or an approval, so the composer stays sufficient.
      //
      // Sufficient only if it is actually usable, though. The run is parked on
      // a human, and no `session.waiting` follows — that event marks the end of
      // a *turn*, and this turn has not ended. Leaving `status: "streaming"`
      // here is what turned an approval prompt into a chat that spins until the
      // stream dies: the agent asked a question and then disabled the only
      // control that could answer it.
      const requests = Array.isArray(data?.requests) ? (data.requests as unknown[]) : [];
      const prompts = requests
        .map((raw) => str(record(raw)?.prompt))
        .filter((prompt): prompt is string => Boolean(prompt));
      if (prompts.length === 0) return { ...base, status: "idle" };

      return {
        ...base,
        status: "idle",
        messages: withAssistant(base, turnId, (bubble) => {
          bubble.text = [bubble.text, ...prompts].filter(Boolean).join("\n\n");
          bubble.final = true;
          bubble.streaming = false;
        }),
      };
    }

    case "authorization.required": {
      const name = str(data?.name) ?? "אחד החיבורים";
      const url = str(record(data?.authorization)?.url);
      return {
        ...base,
        error: url
          ? `${name} מבקש התחברות. פתחו את ${url} ואשרו, והשיחה תמשיך מעצמה.`
          : `${name} מבקש התחברות לפני שאפשר להמשיך.`,
      };
    }

    case "turn.completed":
    case "turn.cancelled":
      return { ...base, messages: settle(base.messages) };

    // A step can fail and still be recovered by the harness (model failover,
    // for one), and no `turn.failed` follows. Painting an error card here would
    // flash a lie, so the terminal turn/session failure is what the user sees.
    case "step.failed":
      return base;

    case "turn.failed":
    case "session.failed":
      return {
        ...base,
        // Clears every `streaming` flag, so a mid-stream failure cannot strand
        // the typing indicator.
        messages: settle(base.messages),
        status: "failed",
        error: failureMessage(data),
        retryable: true,
      };

    case "session.waiting":
      return {
        ...base,
        messages: settle(base.messages),
        status: "waiting",
        continuationToken: str(data?.continuationToken) ?? state.continuationToken,
      };

    case "session.completed":
      return { ...base, messages: settle(base.messages), status: "completed" };

    // step.started / step.completed / reasoning.* / compaction.* / subagent.*
    // carry nothing this UI renders. Reasoning is deliberately not shown.
    default:
      return base;
  }
}

/**
 * Removes the user bubble a retry just replaced.
 *
 * Re-sending after `turn.failed` puts the same question on the wire again, and
 * eve confirms it with a second `message.received`. Rather than showing the
 * question twice, the earlier copy is dropped so the thread reads as one
 * question that eventually got answered. Only the immediately preceding user
 * turn can be superseded, and only when it matches word for word.
 */
export function dropSupersededUser(messages: EveBubble[]): EveBubble[] {
  const latest = messages[messages.length - 1];
  if (!latest || latest.role !== "user") return messages;

  for (let index = messages.length - 2; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate.role !== "user") continue;

    if (candidate.text === latest.text && candidate.audio === latest.audio) {
      return [...messages.slice(0, index), ...messages.slice(index + 1)];
    }
    return messages;
  }

  return messages;
}

/* ------------------------------------------------------- activity grouping */

/** Runs of the same status line, folded into one row with a count. */
export type ActivityGroup = {
  /** The first member's call id — stable while the run grows. */
  id: string;
  label: string;
  /** How many calls this row stands for. */
  count: number;
  /** Every call in the run has returned. */
  done: boolean;
};

/**
 * How many status rows the live list shows before the older ones fold away.
 *
 * A deep research turn can fire a dozen calls; without a ceiling the bubble
 * grows past the screen and pushes the answer out of view while it streams.
 */
export const ACTIVITY_LIVE_ROWS = 3;

/**
 * Folds *adjacent* calls sharing a label into one row.
 *
 * Adjacent only, deliberately: "מחפש ברשת" three times in a row is one thing
 * happening three times and reads as `×3`, but the same line reappearing after
 * the agent went off to read a guide is a second, separate attempt, and
 * collapsing the two would hide that the agent looped back.
 */
export function groupActivity(activity: EveActivity[]): ActivityGroup[] {
  const groups: ActivityGroup[] = [];

  for (const item of activity) {
    const last = groups[groups.length - 1];
    if (last && last.label === item.label) {
      last.count += 1;
      last.done = last.done && item.done;
      continue;
    }
    groups.push({ id: item.id, label: item.label, count: 1, done: item.done });
  }

  return groups;
}

/** Drops turn placeholders that never produced text or a status line. */
export function visibleMessages(messages: EveBubble[]): EveBubble[] {
  return messages.filter(
    (message) =>
      message.role === "user" ||
      message.streaming ||
      message.text.trim().length > 0 ||
      message.activity.length > 0,
  );
}

/** Splits an NDJSON buffer into parsed events plus the unterminated remainder. */
export function parseNdjson(buffer: string): { events: EveEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: EveEvent[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const event = record(parsed);
      if (event && typeof event.type === "string") events.push(event as EveEvent);
    } catch {
      // A truncated or non-JSON line is skipped rather than killing the stream.
    }
  }

  return { events, rest };
}
