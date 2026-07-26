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

/** One rendered bubble. Shared shape with the AI SDK fallback transport. */
export type EveBubble = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** The user bubble carried a voice note (audio file part). */
  audio: boolean;
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
  /** Absolute count of events consumed — the reconnect `startIndex`. */
  cursor: number;
  /** How many `message.received` events landed; drops optimistic bubbles. */
  received: number;
};

export type LabelFn = (toolName: string, input: Record<string, unknown> | undefined) => string;

/** Rendered in place of the transcript for a voice message. */
export const VOICE_BUBBLE_LABEL = "🎤 הודעה קולית";

/** Text part that rides along with an audio attachment, so the flattened
 *  `message.received.data.message` is never empty. */
export const VOICE_TEXT_PART = "(הודעה קולית)";

export const EVE_INITIAL_STATE: EveState = {
  messages: [],
  continuationToken: null,
  status: "idle",
  error: null,
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

/** Reads the structured user message, preferring `parts` over the flat summary. */
export function readUserMessage(data: Record<string, unknown> | undefined): {
  text: string;
  audio: boolean;
} {
  const parts = Array.isArray(data?.parts) ? (data.parts as unknown[]) : [];
  let text = "";
  let audio = false;

  for (const raw of parts) {
    const part = record(raw);
    if (!part) continue;

    if (part.type === "text") {
      text += str(part.text) ?? "";
    } else if (part.type === "file") {
      const mediaType = str(part.mediaType) ?? "";
      if (mediaType.startsWith("audio/")) audio = true;
    }
  }

  if (parts.length === 0) text = str(data?.message) ?? "";
  text = text.trim();

  if (audio) {
    text = text && text !== VOICE_TEXT_PART ? `${VOICE_BUBBLE_LABEL} — ${text}` : VOICE_BUBBLE_LABEL;
  }

  return { text, audio };
}

/** Turns a failure payload into something a Hebrew-speaking family can act on. */
export function failureMessage(data: Record<string, unknown> | undefined): string {
  const message = str(data?.message) ?? "";

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
    return "התשובה לקחה יותר מדי זמן. נסו לשאול שוב.";
  }
  return "משהו השתבש בדרך לסוכן. נסו שוב בעוד רגע.";
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
      return { ...base, status: "streaming", error: null };

    case "message.received": {
      const { text, audio } = readUserMessage(data);
      const id = `user:${turnId ?? "turn"}:${String(data?.sequence ?? state.received)}`;
      if (state.messages.some((message) => message.id === id)) return base;

      return {
        ...base,
        received: state.received + 1,
        messages: [
          ...state.messages,
          { id, role: "user", text, audio, activity: [], streaming: false, final: true },
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
      const requests = Array.isArray(data?.requests) ? (data.requests as unknown[]) : [];
      const prompts = requests
        .map((raw) => str(record(raw)?.prompt))
        .filter((prompt): prompt is string => Boolean(prompt));
      if (prompts.length === 0) return base;

      return {
        ...base,
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

    case "step.failed":
    case "turn.failed":
    case "session.failed":
      return {
        ...base,
        messages: settle(base.messages),
        status: "failed",
        error: failureMessage(data),
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
