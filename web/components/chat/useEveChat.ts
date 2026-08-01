"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  EVE_INITIAL_STATE,
  VOICE_BUBBLE_LABEL,
  VOICE_TEXT_PART,
  dropSupersededUser,
  reduceEve,
  visibleMessages,
  type BubbleAttachment,
  type EveBubble,
  type EveEvent,
  type EveState,
} from "./eve-protocol";
import { textAttachmentPart, type Attachment } from "./attachments";
import {
  EveTransportError,
  NETWORK_FAILURE,
  cancelTurn,
  createSession,
  fetchContinuationToken,
  sendFollowUp,
  streamSession,
  type EveMessage,
  type EveMessagePart,
} from "./eve-client";
import { toolStatusLabel } from "./tool-labels";

/**
 * Durable-session chat state.
 *
 * The transcript is NOT kept locally: on load the whole conversation is
 * rebuilt by streaming the durable session from `startIndex=0`, and the same
 * connection then stays attached for live events. Only the session id is
 * persisted.
 *
 * Consequence worth knowing: the session id lives in per-device localStorage,
 * so each family member gets their own conversation. Sharing a thread across
 * devices would mean sharing the session id — not wired up.
 */

const SESSION_KEY = "japan2026.eve.session.v1";
const MAX_RECONNECTS = 5;

/**
 * One turn's payload.
 *
 * `spoken` marks a turn whose `text` came from an audio-native model listening
 * to a recording rather than from the keyboard — see app/api/transcribe. It
 * changes two things: the agent is told the wording is heard (so a mangled place
 * name is forgiven), and the bubble offers the recording for playback.
 */
export type SendInput = {
  text?: string;
  spoken?: boolean;
  attachments?: readonly Attachment[];
};

/** How the visible error card should read and which icon it gets. */
export type ChatErrorKind = "offline" | "agent";

type ChatState = {
  eve: EveState;
  /** Optimistic user bubble, dropped as soon as `message.received` confirms it. */
  pending: EveBubble[];
  sending: boolean;
  /** A resend is in flight; the next `message.received` replaces its predecessor. */
  retrying: boolean;
  localError: string | null;
  localErrorKind: ChatErrorKind | null;
};

type Action =
  | { kind: "event"; event: EveEvent }
  | { kind: "optimistic"; bubble: EveBubble }
  | { kind: "retrying" }
  | { kind: "error"; message: string; errorKind: ChatErrorKind }
  | { kind: "clearError" }
  | { kind: "reset" };

const INITIAL: ChatState = {
  eve: EVE_INITIAL_STATE,
  pending: [],
  sending: false,
  retrying: false,
  localError: null,
  localErrorKind: null,
};

const SETTLES = new Set([
  "session.waiting",
  "session.failed",
  "session.completed",
  "turn.failed",
  "turn.cancelled",
]);

function reducer(state: ChatState, action: Action): ChatState {
  switch (action.kind) {
    case "event": {
      const eve = reduceEve(state.eve, action.event, toolStatusLabel);
      const confirmed = action.event.type === "message.received";

      return {
        eve:
          confirmed && state.retrying
            ? { ...eve, messages: dropSupersededUser(eve.messages) }
            : eve,
        pending: confirmed ? [] : state.pending,
        retrying: confirmed ? false : state.retrying,
        sending: SETTLES.has(action.event.type) ? false : state.sending,
        localError: eve.error ? null : state.localError,
        localErrorKind: eve.error ? null : state.localErrorKind,
      };
    }
    case "optimistic":
      return {
        ...state,
        pending: [action.bubble],
        sending: true,
        retrying: false,
        localError: null,
        localErrorKind: null,
      };
    case "retrying":
      // The failed bubble stays on screen; no optimistic copy is added.
      return {
        ...state,
        sending: true,
        retrying: true,
        localError: null,
        localErrorKind: null,
        eve: { ...state.eve, error: null, retryable: false },
      };
    case "error":
      return {
        ...state,
        pending: [],
        sending: false,
        retrying: false,
        localError: action.message,
        localErrorKind: action.errorKind,
      };
    case "clearError":
      return {
        ...state,
        localError: null,
        localErrorKind: null,
        eve: { ...state.eve, error: null, retryable: false },
      };
    case "reset":
      return INITIAL;
  }
}

function readStoredSession(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const id = (parsed as { sessionId?: unknown }).sessionId;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

function writeStoredSession(sessionId: string | null): void {
  try {
    if (sessionId) window.localStorage.setItem(SESSION_KEY, JSON.stringify({ sessionId }));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Private mode: the chat still works, it just will not resume after reload.
  }
}

/**
 * Builds the message body. Attachments follow the documented eve contract
 * (eve/docs/guides/client/messages.mdx — "Send attachments"): the message is an
 * AI SDK `UserContent` array whose file part carries a base64 `data:` URL,
 * `mediaType` and `filename`.
 *
 * Part order is fixed: context metadata, then the user's words, then files.
 * Text attachments are inlined as words rather than sent as file parts — eve
 * would stage them into the sandbox, and this agent has no filesystem tools to
 * open them again.
 */
function buildMessage(input: SendInput, contextLine: string | null): EveMessage {
  const typed = input.text?.trim() ?? "";
  const attachments = input.attachments ?? [];
  const body = typed || (input.spoken ? VOICE_TEXT_PART : "");
  if (!body && attachments.length === 0) return "";

  // A plain typed turn with no context stays a plain string, as before.
  if (!contextLine && attachments.length === 0) return body;

  const parts: EveMessagePart[] = [];
  if (contextLine) parts.push({ type: "text", text: contextLine });
  if (body) parts.push({ type: "text", text: body });

  for (const attachment of attachments) {
    if (attachment.kind === "text") {
      parts.push({ type: "text", text: textAttachmentPart(attachment) });
    } else if (attachment.dataUrl) {
      parts.push({
        type: "file",
        data: attachment.dataUrl,
        mediaType: attachment.mediaType,
        filename: attachment.name,
      });
    }
  }

  return parts;
}

/** Projects picked files onto the bubble shape, for the optimistic render. */
export function toBubbleAttachments(
  attachments: readonly Attachment[] = [],
): BubbleAttachment[] {
  return attachments.map((attachment) => ({
    id: attachment.id,
    kind: attachment.kind,
    name: attachment.name,
    mediaType: attachment.mediaType,
    url: attachment.previewUrl,
  }));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export type UseEveChatOptions = {
  /**
   * Resolves the `[הקשר: …]` metadata part for the next turn. Awaited after the
   * optimistic bubble is already on screen, so a slow GPS never delays what the
   * user sees. `voice` adds the clause telling the agent the words were heard.
   */
  resolveContext?: (options: { voice: boolean }) => Promise<string>;
};

export function useEveChat({ resolveContext }: UseEveChatOptions = {}) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  // Read once, lazily: this hook runs client-side only, behind the chat's
  // client-only gate, so there is no SSR markup to mismatch.
  const [resumable] = useState<string | null>(readStoredSession);
  const [sessionId, setSessionId] = useState<string | null>(resumable);
  const [hydrating, setHydrating] = useState<boolean>(Boolean(resumable));

  const sessionRef = useRef<string | null>(resumable);
  const tokenRef = useRef<string | null>(null);
  const cursorRef = useRef(0);
  const streamRef = useRef<AbortController | null>(null);
  const contextRef = useRef(resolveContext);
  /** The last thing the family asked, so a failed turn can be tried again. */
  const lastInputRef = useRef<SendInput | null>(null);
  /** Render-safe mirror of `lastInputRef` — refs must not be read during render. */
  const [hasLastInput, setHasLastInput] = useState(false);

  useEffect(() => {
    tokenRef.current = state.eve.continuationToken;
  }, [state.eve.continuationToken]);

  useEffect(() => {
    contextRef.current = resolveContext;
  }, [resolveContext]);

  /* ------------------------------------------------------------- streaming */

  const startStream = useCallback((id: string, startIndex: number) => {
    streamRef.current?.abort();
    const controller = new AbortController();
    streamRef.current = controller;
    cursorRef.current = startIndex;

    void (async () => {
      let attempts = 0;

      while (!controller.signal.aborted) {
        try {
          for await (const event of streamSession(id, cursorRef.current, controller.signal)) {
            if (controller.signal.aborted) return;
            // Every consumed event advances the absolute reconnect cursor.
            cursorRef.current += 1;
            attempts = 0;
            dispatch({ kind: "event", event });
            // The backlog renders as it arrives; the skeleton is only for the
            // gap before the first event of a resumed session.
            setHydrating(false);
          }
        } catch (error) {
          setHydrating(false);
          if (controller.signal.aborted) return;

          if (error instanceof EveTransportError && (error.status === 404 || error.status === 410)) {
            writeStoredSession(null);
            sessionRef.current = null;
            setSessionId(null);
            dispatch({
              kind: "error",
              message: "השיחה הקודמת כבר לא זמינה אצל הסוכן. אפשר להתחיל שיחה חדשה.",
              errorKind: "agent",
            });
            return;
          }

          attempts += 1;
          if (attempts > MAX_RECONNECTS) {
            dispatch({
              kind: "error",
              message: "החיבור לסוכן נפל ולא הצליח לחזור. בדקו את החיבור לאינטרנט ונסו שוב.",
              errorKind: "offline",
            });
            return;
          }
        }

        // The durable stream closes at connection boundaries; reattach from the
        // cursor so no event is replayed or lost.
        await sleep(Math.min(1000 * 2 ** attempts, 15_000), controller.signal);
      }
    })();
  }, []);

  /* --------------------------------------------------- resume on first load */

  useEffect(() => {
    if (!resumable) return;

    // Rebuild the whole transcript from the durable stream, then stay attached
    // for live events. Nothing but the session id is kept locally.
    startStream(resumable, 0);

    return () => {
      streamRef.current?.abort();
    };
  }, [resumable, startStream]);

  /* ------------------------------------------------------------------ send */

  /** Puts one turn on the wire. Shared by a fresh send and by a retry. */
  const deliver = useCallback(
    async (input: SendInput) => {
      // Re-resolved per attempt, so a retry carries the current time and place.
      const contextLine =
        (await contextRef.current?.({ voice: Boolean(input.spoken) })) ?? null;
      const message = buildMessage(input, contextLine);
      if (message.length === 0) return;

      try {
        if (!sessionRef.current) {
          const handles = await createSession(message);
          sessionRef.current = handles.sessionId;
          tokenRef.current = handles.continuationToken;
          writeStoredSession(handles.sessionId);
          setSessionId(handles.sessionId);
          startStream(handles.sessionId, 0);
          return;
        }

        // A failed turn parks the session and rotates the token on the
        // `session.waiting` that follows. If the retry beat that event, read
        // the stream tail to recover the handle rather than dead-ending.
        let token = tokenRef.current;
        if (!token) token = await fetchContinuationToken(sessionRef.current);
        if (!token) {
          throw new EveTransportError("השיחה עוד נטענת מהסוכן. נסו שוב בעוד רגע.", 409);
        }

        // `session.waiting` is the authoritative source, but the POST reply
        // carries the rotated token too — take it as a safety net.
        const rotated = await sendFollowUp(sessionRef.current, token, message);
        if (rotated) tokenRef.current = rotated;
      } catch (error) {
        const failed = error instanceof EveTransportError ? error : null;
        dispatch({
          kind: "error",
          message: failed?.message || "לא הצלחנו לשלוח את ההודעה לסוכן. נסו שוב בעוד רגע.",
          errorKind: failed?.status === NETWORK_FAILURE ? "offline" : "agent",
        });
      }
    },
    [startStream],
  );

  const send = useCallback(
    async (input: SendInput) => {
      const typed = input.text?.trim() ?? "";
      const attachments = input.attachments ?? [];
      if (!typed && attachments.length === 0) return;

      lastInputRef.current = input;
      setHasLastInput(true);

      // The bubble lands first; the context lookup happens behind it.
      dispatch({
        kind: "optimistic",
        bubble: {
          id: `pending:${Date.now()}`,
          role: "user",
          text: typed || (input.spoken ? VOICE_BUBBLE_LABEL : ""),
          audio: Boolean(input.spoken),
          attachments: toBubbleAttachments(attachments),
          activity: [],
          streaming: false,
          final: true,
        },
      });

      await deliver(input);
    },
    [deliver],
  );

  /**
   * Re-sends the last question on the same parked session. The failed user
   * bubble stays on screen and is replaced — not duplicated — once eve confirms
   * the resend with a new `message.received`.
   */
  const retry = useCallback(async () => {
    const last = lastInputRef.current;
    if (!last) return;

    dispatch({ kind: "retrying" });
    await deliver(last);
  }, [deliver]);

  const cancel = useCallback(() => {
    if (sessionRef.current) void cancelTurn(sessionRef.current);
  }, []);

  const newChat = useCallback(() => {
    streamRef.current?.abort();
    streamRef.current = null;
    sessionRef.current = null;
    tokenRef.current = null;
    cursorRef.current = 0;
    lastInputRef.current = null;
    setHasLastInput(false);
    writeStoredSession(null);
    setSessionId(null);
    setHydrating(false);
    dispatch({ kind: "reset" });
  }, []);

  const clearError = useCallback(() => dispatch({ kind: "clearError" }), []);

  const messages = useMemo(
    () => [...visibleMessages(state.eve.messages), ...state.pending],
    [state.eve.messages, state.pending],
  );

  const busy = state.sending || state.eve.status === "streaming";

  return {
    messages,
    busy,
    /** True while the transcript is still being rebuilt from the durable stream. */
    hydrating: hydrating && Boolean(sessionId),
    error: state.localError ?? state.eve.error,
    /** "offline" for a rejected fetch, "agent" for a failure eve reported. */
    errorKind: state.localErrorKind ?? (state.eve.error ? "agent" : null),
    /** The error card can offer to send the question again. */
    canRetry: hasLastInput && !busy && Boolean(state.eve.retryable || state.localError),
    hasSession: Boolean(sessionId),
    send,
    retry,
    cancel,
    newChat,
    clearError,
  };
}
