"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  EVE_INITIAL_STATE,
  VOICE_BUBBLE_LABEL,
  VOICE_TEXT_PART,
  dropSupersededUser,
  markPromptAnswered,
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
  sendInputResponses,
  streamSession,
  type EveInputResponse,
  type EveMessage,
  type EveMessagePart,
} from "./eve-client";
import { guideTitles, toolStatusLabel, type GuideTitles } from "./tool-labels";

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
 * How long a resumed session may stay silent before we stop believing in it.
 *
 * A session the agent no longer knows about does not 404 — it accepts the
 * stream and then sends nothing, so the relay sits on an open body until it
 * times out minutes later and 500s. The client reads that as a transient drop
 * and reconnects behind the loading skeleton, so the chat looks like it is
 * thinking, forever. (Seen for real: 5.6 minutes on a session created against
 * a different agent deployment.)
 *
 * Replaying a durable transcript is fast, so silence this long means the
 * session is gone, not slow.
 *
 * It is deliberately NOT proof of that, though: a cold relay plus a cold agent
 * can eat this budget on a healthy session, and the agent now does work the
 * family never asked for — background research that lands on this very stream.
 * Throwing the session id away on a hunch would orphan that work permanently,
 * so this only stops the skeleton and offers a re-attach. The id survives.
 */
const RESUME_SILENCE_MS = 20_000;

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
  // The guide titles ride along with the event rather than being read from
  // module scope: they come from Convex, so the reducer must not close over a
  // copy that was correct when this file was written.
  | { kind: "event"; event: EveEvent; guides: GuideTitles }
  | { kind: "optimistic"; bubble: EveBubble }
  | { kind: "answered"; requestId: string }
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
  // Not the end of a turn, but the end of *our* wait: the run is parked on a
  // human answer (an `ask_question`, or an approval gate on `edit_plan_doc` /
  // `mark_done`) and nothing moves until one is typed. No `session.waiting`
  // ever follows, so without this the composer stayed locked behind a spinner
  // for as long as the stream survived — the agent asking a question and
  // simultaneously taking away the means to answer it.
  "input.requested",
]);

function reducer(state: ChatState, action: Action): ChatState {
  switch (action.kind) {
    case "event": {
      const eve = reduceEve(state.eve, action.event, (name, input) =>
        toolStatusLabel(name, input, action.guides),
      );
      // `received` only advances for a message the family actually sent, so a
      // background run reporting into the session cannot drop an optimistic
      // bubble whose send is still in flight.
      const confirmed = eve.received > state.eve.received;

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
    case "answered":
      // The card goes inert on click rather than on the round trip: the answer
      // resumes a run that can then think for a while, and two taps on "אישור"
      // would file the suggestion twice.
      return {
        ...state,
        sending: true,
        localError: null,
        localErrorKind: null,
        eve: {
          ...state.eve,
          messages: markPromptAnswered(state.eve.messages, { requestId: action.requestId }),
        },
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

type StoredSession = { sessionId: string; continuationToken: string | null };

function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sessionId?: unknown; continuationToken?: unknown };
    const id = parsed.sessionId;
    if (typeof id !== "string" || id.length === 0) return null;
    const token = parsed.continuationToken;
    return { sessionId: id, continuationToken: typeof token === "string" && token ? token : null };
  } catch {
    return null;
  }
}

/**
 * Persists the resume handle — id *and* token.
 *
 * The token used to be re-derived on resume from the replayed `session.waiting`,
 * which is fine right up until the session is parked somewhere else. A run
 * halted on an approval gate never emits `session.waiting`, so after a reload
 * there was no token to be found: `fetchContinuationToken` reads the stream tail,
 * finds `input.requested`, and that event carries none. The next send then died
 * on "השיחה עוד נטענת מהסוכן" with nothing the family could do about it.
 *
 * Storing it is safe because the eve channel mints `eve:<uuid>` once at session
 * creation and its continue route reuses whatever the client sends — the token is
 * stable for the life of the session, not rotated per turn. Verified against the
 * live agent: the token returned by `POST /eve/v1/session` is byte-identical to
 * the one in that session's `session.waiting`.
 */
function writeStoredSession(sessionId: string | null, continuationToken?: string | null): void {
  try {
    if (!sessionId) {
      window.localStorage.removeItem(SESSION_KEY);
      return;
    }
    // An omitted token keeps whatever is already stored; an explicit null clears it.
    const token =
      continuationToken === undefined
        ? (readStoredSession()?.continuationToken ?? null)
        : continuationToken;
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ sessionId, continuationToken: token }));
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
  const [stored] = useState<StoredSession | null>(readStoredSession);
  const resumable = stored?.sessionId ?? null;
  const [sessionId, setSessionId] = useState<string | null>(resumable);
  const [hydrating, setHydrating] = useState<boolean>(Boolean(resumable));
  /** Mirrors `hydrating` for the silence timer, which outlives its closure. */
  const hydratingRef = useRef(Boolean(resumable));
  useEffect(() => {
    hydratingRef.current = hydrating;
  }, [hydrating]);

  const sessionRef = useRef<string | null>(resumable);
  // Seeded from storage so a session parked on an approval — which never emits
  // the `session.waiting` this used to be derived from — is still answerable
  // after a reload.
  const tokenRef = useRef<string | null>(stored?.continuationToken ?? null);
  const cursorRef = useRef(0);
  const streamRef = useRef<AbortController | null>(null);
  /** Pending dead-session timer, cleared by the first event of an attach. */
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextRef = useRef(resolveContext);
  /**
   * Guide titles for the status lines, live from Convex.
   *
   * Mirrored into a ref because the events are dispatched from inside a stream
   * loop that outlives the render it started in — reading `titles` there would
   * pin whatever was loaded when the stream was opened.
   */
  const guides = useQuery(api.trip.listGuides);
  const titles = useMemo(() => guideTitles(guides), [guides]);
  const titlesRef = useRef<GuideTitles>(titles);
  useEffect(() => {
    titlesRef.current = titles;
  }, [titles]);
  /** The last thing the family asked, so a failed turn can be tried again. */
  const lastInputRef = useRef<SendInput | null>(null);
  /** Render-safe mirror of `lastInputRef` — refs must not be read during render. */
  const [hasLastInput, setHasLastInput] = useState(false);

  // A replayed `session.waiting` refreshes the handle; a session parked
  // elsewhere keeps the one from storage rather than being reset to null.
  useEffect(() => {
    if (!state.eve.continuationToken) return;
    tokenRef.current = state.eve.continuationToken;
    if (sessionRef.current) writeStoredSession(sessionRef.current, state.eve.continuationToken);
  }, [state.eve.continuationToken]);

  useEffect(() => {
    contextRef.current = resolveContext;
  }, [resolveContext]);

  /* ------------------------------------------------------------- streaming */

  const stopSilenceTimer = useCallback(() => {
    if (silenceRef.current === null) return;
    clearTimeout(silenceRef.current);
    silenceRef.current = null;
  }, []);

  /**
   * Starts the dead-session countdown for an attach that has to rebuild the
   * whole transcript. Re-armable, so a manual re-attach gets its own window
   * instead of inheriting an expired one.
   */
  const armSilenceTimer = useCallback(() => {
    stopSilenceTimer();
    silenceRef.current = setTimeout(() => {
      silenceRef.current = null;
      if (!hydratingRef.current) return;

      streamRef.current?.abort();
      setHydrating(false);
      dispatch({
        kind: "error",
        message: "לא הצלחנו לטעון את השיחה הקודמת. אפשר לנסות שוב או להתחיל שיחה חדשה.",
        errorKind: "agent",
      });
    }, RESUME_SILENCE_MS);
  }, [stopSilenceTimer]);

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
            dispatch({ kind: "event", event, guides: titlesRef.current });
            // The backlog renders as it arrives; the skeleton is only for the
            // gap before the first event of a resumed session.
            stopSilenceTimer();
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
  }, [stopSilenceTimer]);

  /* --------------------------------------------------- resume on first load */

  useEffect(() => {
    if (!resumable) return;

    // Rebuild the whole transcript from the durable stream, then stay attached
    // for live events. Nothing but the session id is kept locally — which is
    // also what makes anything the agent pushed while the chat was unmounted
    // (or the app closed) show up here: it is simply part of the replay.
    startStream(resumable, 0);
    armSilenceTimer();
  }, [resumable, startStream, armSilenceTimer]);

  /**
   * Re-attaches to the durable stream from the cursor.
   *
   * Cheap and idempotent: events already folded in are never replayed, so this
   * is safe to fire on any suspicion that the connection is stale. That matters
   * more than it used to — the agent now speaks unprompted, and a stream that
   * quietly stopped delivering is indistinguishable from an agent with nothing
   * to say.
   */
  const reconnect = useCallback(() => {
    const id = sessionRef.current;
    if (!id) return;

    dispatch({ kind: "clearError" });
    // Still at zero on the session we loaded with means the transcript was
    // never rebuilt: this is a second attempt at the resume, so the skeleton
    // and the countdown both apply again. A session opened during this visit
    // gets neither — it has no history to be slow about.
    if (cursorRef.current === 0 && id === resumable) {
      hydratingRef.current = true;
      setHydrating(true);
      armSilenceTimer();
    }
    startStream(id, cursorRef.current);
  }, [armSilenceTimer, resumable, startStream]);

  /**
   * Revives the stream on every wake and every return of signal.
   *
   * Two ways the chat goes permanently deaf otherwise, both routine on a phone
   * in Japan: the reconnect loop gives up after MAX_RECONNECTS and never tries
   * again, and a backgrounded tab can be resumed holding a socket that will
   * neither error nor deliver. Either way the family stops seeing anything the
   * agent pushes on its own, with no sign that anything is wrong.
   */
  useEffect(() => {
    const revive = () => {
      if (document.visibilityState === "hidden") return;
      reconnect();
    };

    window.addEventListener("online", revive);
    document.addEventListener("visibilitychange", revive);
    return () => {
      window.removeEventListener("online", revive);
      document.removeEventListener("visibilitychange", revive);
    };
  }, [reconnect]);

  /**
   * One teardown for both attach paths — a first send starts a stream too, and
   * without this its reconnect loop outlived the chat page and kept hammering
   * the relay for the rest of the session.
   */
  useEffect(
    () => () => {
      streamRef.current?.abort();
      stopSilenceTimer();
    },
    [stopSilenceTimer],
  );

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
          writeStoredSession(handles.sessionId, handles.continuationToken);
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
          prompts: [],
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
    // Nothing to re-send: this load never got a question in, so the thing that
    // failed was the attach itself. Try that again instead of dead-ending.
    if (!last) {
      reconnect();
      return;
    }

    dispatch({ kind: "retrying" });
    await deliver(last);
  }, [deliver, reconnect]);

  /**
   * Answers a pending approval or question and lets the parked run continue.
   *
   * Deliberately not routed through `deliver`: this is not a turn. It carries no
   * message, adds no user bubble, and must not become `lastInput` — a retry
   * after this should re-send the family's actual question, not re-approve
   * something they already approved.
   */
  const respond = useCallback(
    async (requestId: string, optionId: string) => {
      const id = sessionRef.current;
      if (!id) return;

      dispatch({ kind: "answered", requestId });

      try {
        let token = tokenRef.current;
        if (!token) token = await fetchContinuationToken(id);
        if (!token) {
          throw new EveTransportError("השיחה עוד נטענת מהסוכן. נסו שוב בעוד רגע.", 409);
        }

        const responses: EveInputResponse[] = [{ requestId, optionId }];
        const rotated = await sendInputResponses(id, token, responses);
        if (rotated) tokenRef.current = rotated;

        // The stream this session was parked on has usually been torn down by
        // now — a parked run sends nothing, and both the relay's fetch and any
        // proxy in front of it time an idle body out (seen locally as
        // UND_ERR_BODY_TIMEOUT after ~40s). Re-attaching from the cursor is
        // cheap and idempotent, and without it the resumed run streams into a
        // connection nobody is holding.
        reconnect();
      } catch (error) {
        const failed = error instanceof EveTransportError ? error : null;
        dispatch({
          kind: "error",
          message: failed?.message || "לא הצלחנו לשלוח את התשובה לסוכן. נסו שוב בעוד רגע.",
          errorKind: failed?.status === NETWORK_FAILURE ? "offline" : "agent",
        });
      }
    },
    [reconnect],
  );

  const cancel = useCallback(() => {
    if (sessionRef.current) void cancelTurn(sessionRef.current);
  }, []);

  const newChat = useCallback(() => {
    streamRef.current?.abort();
    streamRef.current = null;
    stopSilenceTimer();
    hydratingRef.current = false;
    sessionRef.current = null;
    tokenRef.current = null;
    cursorRef.current = 0;
    lastInputRef.current = null;
    setHasLastInput(false);
    writeStoredSession(null);
    setSessionId(null);
    setHydrating(false);
    dispatch({ kind: "reset" });
  }, [stopSilenceTimer]);

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
    /**
     * The error card can offer to send the question again — or, when this load
     * never got a question in, to re-attach to the session it failed to read.
     */
    canRetry:
      !busy &&
      Boolean(state.eve.retryable || state.localError) &&
      (hasLastInput || Boolean(sessionId)),
    hasSession: Boolean(sessionId),
    send,
    respond,
    retry,
    cancel,
    newChat,
    clearError,
  };
}
