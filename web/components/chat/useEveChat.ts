"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  EVE_INITIAL_STATE,
  VOICE_BUBBLE_LABEL,
  VOICE_TEXT_PART,
  reduceEve,
  visibleMessages,
  type EveBubble,
  type EveEvent,
  type EveState,
} from "./eve-protocol";
import {
  EveTransportError,
  cancelTurn,
  createSession,
  sendFollowUp,
  streamSession,
  type EveMessage,
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

export type VoiceAttachment = { dataUrl: string; mediaType: string };

export type SendInput = { text?: string; audio?: VoiceAttachment };

type ChatState = {
  eve: EveState;
  /** Optimistic user bubble, dropped as soon as `message.received` confirms it. */
  pending: EveBubble[];
  sending: boolean;
  localError: string | null;
};

type Action =
  | { kind: "event"; event: EveEvent }
  | { kind: "optimistic"; bubble: EveBubble }
  | { kind: "error"; message: string }
  | { kind: "clearError" }
  | { kind: "reset" };

const INITIAL: ChatState = { eve: EVE_INITIAL_STATE, pending: [], sending: false, localError: null };

const SETTLES = new Set(["session.waiting", "session.failed", "session.completed", "turn.failed"]);

function reducer(state: ChatState, action: Action): ChatState {
  switch (action.kind) {
    case "event": {
      const eve = reduceEve(state.eve, action.event, toolStatusLabel);
      return {
        eve,
        pending: action.event.type === "message.received" ? [] : state.pending,
        sending: SETTLES.has(action.event.type) ? false : state.sending,
        localError: eve.error ? null : state.localError,
      };
    }
    case "optimistic":
      return { ...state, pending: [action.bubble], sending: true, localError: null };
    case "error":
      return { ...state, pending: [], sending: false, localError: action.message };
    case "clearError":
      return { ...state, localError: null, eve: { ...state.eve, error: null } };
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

/** Extension for the recorded blob, so the attachment has a sane filename. */
function audioFilename(mediaType: string): string {
  if (mediaType.includes("mp4") || mediaType.includes("aac")) return "voice.m4a";
  if (mediaType.includes("ogg")) return "voice.ogg";
  if (mediaType.includes("mpeg")) return "voice.mp3";
  if (mediaType.includes("wav")) return "voice.wav";
  return "voice.webm";
}

/**
 * Builds the message body. Attachments follow the documented eve contract
 * (eve/docs/guides/client/messages.mdx — "Send attachments"): the message is an
 * AI SDK `UserContent` array whose file part carries a base64 `data:` URL,
 * `mediaType` and `filename`.
 */
function buildMessage(input: SendInput): EveMessage {
  const text = input.text?.trim() ?? "";
  if (!input.audio) return text;

  return [
    { type: "text", text: text || VOICE_TEXT_PART },
    {
      type: "file",
      data: input.audio.dataUrl,
      mediaType: input.audio.mediaType,
      filename: audioFilename(input.audio.mediaType),
    },
  ];
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

export function useEveChat() {
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

  useEffect(() => {
    tokenRef.current = state.eve.continuationToken;
  }, [state.eve.continuationToken]);

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
            });
            return;
          }

          attempts += 1;
          if (attempts > MAX_RECONNECTS) {
            dispatch({
              kind: "error",
              message: "החיבור לסוכן נפל ולא הצליח לחזור. בדקו את החיבור לאינטרנט ונסו שוב.",
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

  const send = useCallback(
    async (input: SendInput) => {
      const message = buildMessage(input);
      if (message.length === 0) return;

      dispatch({
        kind: "optimistic",
        bubble: {
          id: `pending:${Date.now()}`,
          role: "user",
          text: input.audio ? VOICE_BUBBLE_LABEL : (input.text?.trim() ?? ""),
          audio: Boolean(input.audio),
          activity: [],
          streaming: false,
          final: true,
        },
      });

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

        const token = tokenRef.current;
        if (!token) {
          throw new EveTransportError("השיחה עוד נטענת מהסוכן. נסו שוב בעוד רגע.", 409);
        }

        // `session.waiting` is the authoritative source, but the POST reply
        // carries the rotated token too — take it as a safety net.
        const rotated = await sendFollowUp(sessionRef.current, token, message);
        if (rotated) tokenRef.current = rotated;
      } catch (error) {
        const message_ =
          error instanceof EveTransportError && error.message
            ? error.message
            : "לא הצלחנו לשלוח את ההודעה לסוכן. נסו שוב בעוד רגע.";
        dispatch({ kind: "error", message: message_ });
      }
    },
    [startStream],
  );

  const cancel = useCallback(() => {
    if (sessionRef.current) void cancelTurn(sessionRef.current);
  }, []);

  const newChat = useCallback(() => {
    streamRef.current?.abort();
    streamRef.current = null;
    sessionRef.current = null;
    tokenRef.current = null;
    cursorRef.current = 0;
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
    hasSession: Boolean(sessionId),
    send,
    cancel,
    newChat,
    clearError,
  };
}
