"use client";

import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  AlertTriangle,
  ArrowUp,
  Check,
  MessageCirclePlus,
  Mic,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  WifiOff,
} from "lucide-react";
import { Markdown } from "./Markdown";
import { messageText, toolActivity } from "./tool-labels";
import type { TripUIMessage } from "./agent";
import type { EveBubble } from "./eve-protocol";
import { fetchAgentEnabled } from "./eve-client";
import { useEveChat, type SendInput, type VoiceAttachment } from "./useEveChat";
import { MAX_RECORDING_SECONDS, useVoiceRecorder } from "./useVoiceRecorder";
import { useSpeech } from "./speech";

/**
 * Two transports, one UI.
 *
 * - **eve mode** (when `/api/agent/enabled` says yes): durable server-side
 *   sessions proxied by the Worker. History is rebuilt from the session stream,
 *   so it survives a reload on the same device, and voice notes are supported.
 * - **fallback mode**: the original `useChat` → `POST /api/chat` AI SDK agent,
 *   unchanged, with the transcript in sessionStorage.
 *
 * Everything below `ChatSurface` is shared between them.
 */

/** v2: UIMessage shape. v1 held the old {role,content} records — dropped on load. */
const STORAGE_KEY = "japan2026.chat.v2";
const LEGACY_STORAGE_KEYS = ["japan2026.chat.v1"];

const SUGGESTIONS = [
  "מה התוכנית ל־5 באוקטובר?",
  "איפה אוכלים ליד מוזיאון ג׳יבלי?",
  "מה עוד לא הזמנו?",
  "מה עושים אם יורד גשם ביום 7?",
];

const OFFLINE_MESSAGE =
  "אין חיבור לאינטרנט, אז אי אפשר לשאול כרגע. המסלול והמדריכים עדיין זמינים אופליין.";

type TransportError = { message: string; hint?: string };

/** Reads persisted UIMessages, discarding anything that is not the current shape. */
function loadStored(): TripUIMessage[] {
  if (typeof window === "undefined") return [];
  try {
    LEGACY_STORAGE_KEYS.forEach((key) => window.sessionStorage.removeItem(key));

    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((entry): entry is TripUIMessage => {
      if (typeof entry !== "object" || entry === null) return false;
      const { id, role, parts } = entry as Partial<TripUIMessage>;
      return (
        typeof id === "string" && (role === "user" || role === "assistant") && Array.isArray(parts)
      );
    });
  } catch {
    return [];
  }
}

/** Parses the JSON body the worker returns on 4xx/5xx into a renderable error. */
function parseTransportError(error: Error | undefined): TransportError | null {
  if (!error) return null;
  try {
    const parsed = JSON.parse(error.message) as { error?: string; hint?: string };
    if (parsed.error) return { message: parsed.error, hint: parsed.hint };
  } catch {
    // not our JSON envelope — fall through
  }
  return { message: error.message || "משהו השתבש בדרך לצ׳אט. נסו שוב בעוד רגע." };
}

/* Client-only mount, so state can be seeded straight from storage without an
   SSR mismatch (and without setState-in-effect). */
const subscribeNoop = () => () => {};
const onClient = () => true;
const onServer = () => false;

export function ChatView() {
  const ready = useSyncExternalStore(subscribeNoop, onClient, onServer);

  if (ready) return <ChatRuntime />;

  // Server render / first hydration pass. Same chrome as the live view, so
  // swapping in the real conversation costs no layout shift.
  return (
    <ChatShell
      head={<ChatHeader />}
      composer={
        <div className="chat-composer">
          <textarea className="chat-input" rows={1} placeholder="שאלו כל דבר על הטיול…" disabled />
          <span className="chat-send" aria-hidden="true">
            <ArrowUp size={19} />
          </span>
        </div>
      }
    />
  );
}

/** Picks the transport once, then never re-renders across it. */
function ChatRuntime() {
  const [mode, setMode] = useState<"resolving" | "eve" | "sdk">("resolving");

  useEffect(() => {
    const controller = new AbortController();
    void fetchAgentEnabled(controller.signal).then((enabled) => {
      if (!controller.signal.aborted) setMode(enabled ? "eve" : "sdk");
    });
    return () => controller.abort();
  }, []);

  if (mode === "resolving") {
    return (
      <ChatShell
        head={<ChatHeader />}
        composer={
          <div className="chat-composer">
            <textarea className="chat-input" rows={1} placeholder="שאלו כל דבר על הטיול…" disabled />
            <span className="chat-send" aria-hidden="true">
              <ArrowUp size={19} />
            </span>
          </div>
        }
      />
    );
  }

  return mode === "eve" ? <EveConversation /> : <SdkConversation />;
}

/* ========================================================== eve transport */

function EveConversation() {
  const chat = useEveChat();
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const submit = useCallback(
    (input: SendInput) => {
      setVoiceError(null);
      void chat.send(input);
    },
    [chat],
  );

  const error: TransportError | null = chat.error ? { message: chat.error } : null;

  return (
    <ChatSurface
      messages={chat.messages}
      busy={chat.busy}
      hydrating={chat.hydrating}
      error={voiceError ? { message: voiceError } : error}
      onSubmit={submit}
      onStop={chat.cancel}
      onReset={chat.messages.length > 0 || chat.hasSession ? chat.newChat : undefined}
      onVoiceError={setVoiceError}
      voiceEnabled
    />
  );
}

/* ============================================= AI SDK fallback transport */

function SdkConversation() {
  const initialMessages = useMemo(() => loadStored(), []);
  const transport = useMemo(() => new DefaultChatTransport<TripUIMessage>({ api: "/api/chat" }), []);

  const { messages, sendMessage, status, error, stop, setMessages, clearError } =
    useChat<TripUIMessage>({ transport, messages: initialMessages });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // sessionStorage can be unavailable (private mode); the chat still works.
    }
  }, [messages]);

  const bubbles = useMemo<EveBubble[]>(
    () =>
      messages.map((message, index) => {
        const text = messageText(message);
        const last = index === messages.length - 1;
        return {
          id: message.id,
          role: message.role === "user" ? "user" : "assistant",
          text,
          audio: false,
          activity: message.role === "user" ? [] : toolActivity(message),
          streaming: message.role === "assistant" && last && busy,
          final: message.role === "assistant" && !(last && busy) && text.trim().length > 0,
        };
      }),
    [messages, busy],
  );

  const submit = useCallback(
    (input: SendInput) => {
      const question = input.text?.trim();
      if (!question) return;
      clearError();
      void sendMessage({ text: question });
    },
    [clearError, sendMessage],
  );

  const reset = useCallback(() => {
    stop();
    setMessages([]);
    clearError();
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, [clearError, setMessages, stop]);

  return (
    <ChatSurface
      messages={bubbles}
      busy={busy}
      error={parseTransportError(error)}
      onSubmit={submit}
      onStop={stop}
      onReset={bubbles.length > 0 ? reset : undefined}
      // No mic here: /api/chat runs Claude through the Gateway, which does not
      // take audio input. Voice questions need eve mode.
      voiceEnabled={false}
    />
  );
}

/* ============================================================ shared shell */

/** Header + scroller + composer chrome, shared by the skeleton and the real view. */
function ChatShell({
  head,
  children,
  composer,
  scrollerRef,
  onScroll,
}: {
  head: ReactNode;
  children?: ReactNode;
  composer?: ReactNode;
  scrollerRef?: RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
}) {
  return (
    <div className="chat-shell">
      {head}
      <div className="chat-scroller" ref={scrollerRef} onScroll={onScroll}>
        <div className="chat-thread">{children}</div>
      </div>
      {composer}
      <p className="chat-note">Enter לשליחה · Shift+Enter לשורה חדשה</p>
    </div>
  );
}

function ChatHeader({
  onReset,
  autoSpeak,
  onToggleSpeak,
}: {
  onReset?: () => void;
  autoSpeak?: boolean;
  onToggleSpeak?: () => void;
}) {
  return (
    <header className="chat-head">
      <div className="chat-head-title">
        <span className="chat-head-mark" aria-hidden="true">
          日
        </span>
        <div>
          <h1>צ׳אט הטיול</h1>
          <p>שואלים בעברית — הסוכן קורא ממסמכי התכנון של המסע.</p>
        </div>
      </div>
      <div className="chat-head-actions">
        {onToggleSpeak ? (
          <button
            type="button"
            className={`btn btn-ghost btn-sm chat-speak-toggle${autoSpeak ? " is-on" : ""}`}
            onClick={onToggleSpeak}
            aria-pressed={autoSpeak}
            aria-label={autoSpeak ? "כיבוי הקראה אוטומטית" : "הקראה אוטומטית של התשובות"}
            title={autoSpeak ? "הקראה אוטומטית פועלת" : "הקראה אוטומטית כבויה"}
          >
            {autoSpeak ? <Volume2 size={16} /> : <VolumeX size={16} />}
            הקראה
          </button>
        ) : null}
        {onReset ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>
            <MessageCirclePlus size={16} />
            שיחה חדשה
          </button>
        ) : null}
      </div>
    </header>
  );
}

function ChatSurface({
  messages,
  busy,
  error,
  hydrating = false,
  onSubmit,
  onStop,
  onReset,
  onVoiceError,
  voiceEnabled,
}: {
  messages: EveBubble[];
  busy: boolean;
  error: TransportError | null;
  hydrating?: boolean;
  onSubmit: (input: SendInput) => void;
  onStop: () => void;
  onReset?: () => void;
  onVoiceError?: (message: string) => void;
  voiceEnabled: boolean;
}) {
  const [input, setInput] = useState("");
  const [offline, setOffline] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const stickToBottom = useRef(true);

  const speech = useSpeech();

  /* ------------------------------------------------------------- send path */

  const guardedSubmit = useCallback(
    (payload: SendInput) => {
      if (busy) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setOffline(true);
        return;
      }
      setOffline(false);
      stickToBottom.current = true;
      onSubmit(payload);
    },
    [busy, onSubmit],
  );

  const submitText = useCallback(
    (text: string) => {
      const question = text.trim();
      if (!question) return;
      setInput("");
      guardedSubmit({ text: question });
    },
    [guardedSubmit],
  );

  const onRecorded = useCallback(
    (audio: VoiceAttachment) => guardedSubmit({ audio }),
    [guardedSubmit],
  );

  const recorder = useVoiceRecorder(onRecorded);

  useEffect(() => {
    if (recorder.error) onVoiceError?.(recorder.error);
  }, [recorder.error, onVoiceError]);

  /* ------------------------------------------------------------ autoscroll */

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  /* ------------------------------------------------------------ auto-speak */

  const spokenRef = useRef<string | null>(null);
  const { autoSpeak, speak } = speech;

  useEffect(() => {
    if (!autoSpeak) return;

    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || !last.final || last.streaming) return;
    if (spokenRef.current === last.id || !last.text.trim()) return;

    spokenRef.current = last.id;
    void speak(last.id, last.text);
  }, [messages, autoSpeak, speak]);

  /* --------------------------------------------------------------- composer */

  const autosize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, []);

  useEffect(() => {
    autosize();
  }, [input, autosize]);

  const isEmpty = messages.length === 0 && !hydrating;
  const transportError: TransportError | null = offline ? { message: OFFLINE_MESSAGE } : error;
  const errorKind = offline ? "offline" : transportError?.hint ? "setup" : "generic";

  const showMic = voiceEnabled && recorder.supported;

  return (
    <ChatShell
      head={
        <ChatHeader
          onReset={onReset}
          autoSpeak={speech.autoSpeak}
          onToggleSpeak={speech.toggleAutoSpeak}
        />
      }
      scrollerRef={scrollerRef}
      onScroll={handleScroll}
      composer={
        <>
          {recorder.recording ? (
            <div className="chat-recording" role="status">
              <span className="chat-recording-dot" aria-hidden="true" />
              <span>מקליט… {formatElapsed(recorder.elapsed)}</span>
              <span className="chat-recording-max">
                עד {MAX_RECORDING_SECONDS} שניות
              </span>
              <button type="button" className="chat-recording-cancel" onClick={recorder.cancel}>
                ביטול
              </button>
            </div>
          ) : null}

          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              submitText(input);
            }}
          >
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={input}
              rows={1}
              placeholder={recorder.recording ? "מקליט הודעה קולית…" : "שאלו כל דבר על הטיול…"}
              disabled={recorder.recording}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submitText(input);
                }
              }}
            />

            {showMic && !busy ? (
              <button
                type="button"
                className={`chat-mic${recorder.recording ? " is-recording" : ""}`}
                onClick={() => (recorder.recording ? recorder.stop() : void recorder.start())}
                aria-label={recorder.recording ? "סיום הקלטה ושליחה" : "הקלטת הודעה קולית"}
                aria-pressed={recorder.recording}
                disabled={recorder.status === "requesting"}
              >
                {recorder.recording ? <Square size={15} fill="currentColor" /> : <Mic size={18} />}
              </button>
            ) : null}

            {busy ? (
              <button
                type="button"
                className="chat-send chat-send-stop"
                onClick={onStop}
                aria-label="עצירת התשובה"
              >
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                className="chat-send"
                disabled={!input.trim() || recorder.recording}
                aria-label="שליחה"
              >
                <ArrowUp size={19} />
              </button>
            )}
          </form>
        </>
      }
    >
      {isEmpty ? (
        <div className="chat-empty">
          <span className="chat-empty-mark">
            <Sparkles size={30} strokeWidth={1.6} />
          </span>
          <h2>מה בא לכם לדעת?</h2>
          <p>
            הסוכן קורא בעצמו את המדריכים, את לוח 17 הימים ואת רשימת ההזמנות — ומצטט מהם. הוא
            לא ימציא מחירים או אישורי הזמנה.
          </p>
          <ul className="chat-suggestions">
            {SUGGESTIONS.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  className="chip chat-suggestion"
                  onClick={() => submitText(suggestion)}
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hydrating && messages.length === 0 ? (
        <article className="chat-bubble chat-bubble-assistant">
          <span className="chat-typing" aria-label="טוען את השיחה">
            <i />
            <i />
            <i />
          </span>
        </article>
      ) : null}

      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
          speaking={speech.speakingId === message.id}
          onSpeak={() =>
            speech.speakingId === message.id
              ? speech.stop()
              : void speech.speak(message.id, message.text)
          }
        />
      ))}

      {busy && !messages.some((message) => message.role === "assistant" && message.streaming) ? (
        <article className="chat-bubble chat-bubble-assistant">
          <span className="chat-typing" aria-label="חושב">
            <i />
            <i />
            <i />
          </span>
        </article>
      ) : null}

      {transportError ? (
        <div
          className={`chat-error${errorKind === "setup" ? " chat-error-setup" : ""}`}
          role="alert"
        >
          <span className="chat-error-icon" aria-hidden="true">
            {errorKind === "offline" ? <WifiOff size={17} /> : <AlertTriangle size={17} />}
          </span>
          <div>
            <strong>{transportError.message}</strong>
            {transportError.hint ? <code>{transportError.hint}</code> : null}
          </div>
        </div>
      ) : null}
    </ChatShell>
  );
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** One bubble: user text, or assistant tool activity + markdown answer. */
function ChatMessage({
  message,
  speaking,
  onSpeak,
}: {
  message: EveBubble;
  speaking: boolean;
  onSpeak: () => void;
}) {
  if (message.role === "user") {
    return (
      <article className={`chat-bubble chat-bubble-user${message.audio ? " is-voice" : ""}`}>
        <p>{message.text}</p>
      </article>
    );
  }

  const activity = message.activity;
  const answered = message.text.trim().length > 0;

  return (
    <article className="chat-bubble chat-bubble-assistant" aria-live="polite">
      {activity.length > 0 ? (
        answered ? (
          // Collapses into a source count once the answer starts streaming.
          <details className="chat-tools chat-tools-done">
            <summary>
              <Check size={13} />
              {activity.length === 1 ? "מקור אחד" : `${activity.length} מקורות`}
            </summary>
            <ul>
              {activity.map((item) => (
                <li key={item.id}>{item.label}</li>
              ))}
            </ul>
          </details>
        ) : (
          <ul className="chat-tools chat-tools-live">
            {activity.map((item) => (
              <li key={item.id} className={item.done ? "is-done" : undefined}>
                {item.done ? <Check size={13} /> : <span className="chat-tool-spinner" />}
                {item.label}
                {item.done ? null : "…"}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {answered ? (
        <Markdown text={message.text} />
      ) : activity.length === 0 ? (
        <span className="chat-typing" aria-label="כותב תשובה">
          <i />
          <i />
          <i />
        </span>
      ) : null}

      {answered && !message.streaming ? (
        <button
          type="button"
          className={`chat-speak${speaking ? " is-speaking" : ""}`}
          onClick={onSpeak}
          aria-label={speaking ? "עצירת ההקראה" : "הקראת התשובה"}
        >
          {speaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
          {speaking ? "עצירה" : "הקראה"}
        </button>
      ) : null}
    </article>
  );
}
