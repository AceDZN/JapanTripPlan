"use client";

import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  AlertTriangle,
  ArrowUp,
  Check,
  FileText,
  MapPin,
  MapPinOff,
  MessageCirclePlus,
  Mic,
  Paperclip,
  RotateCw,
  ShieldQuestion,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from "lucide-react";
import { Markdown } from "./Markdown";
import type { TripUIMessage } from "./agent";
import {
  ACTIVITY_LIVE_ROWS,
  VOICE_CONTEXT_CLAUSE,
  extractTextAttachments,
  groupActivity,
  stripContextLines,
  type BubbleAttachment,
  type EveBubble,
  type EvePrompt,
} from "./eve-protocol";
import { approvalCopy, guideTitles, messageText, toolActivity } from "./tool-labels";
import { fetchAgentEnabled } from "./eve-client";
import { useGeoContext, type GeoContext } from "./useGeoContext";
import { useEveChat, type SendInput } from "./useEveChat";
import { ACCEPT_ATTR, textAttachmentPart } from "./attachments";
import { useComposerAttachments } from "./useComposerAttachments";
import { MAX_RECORDING_SECONDS } from "./useVoiceRecorder";
import { useVoiceTurn } from "./useVoiceTurn";
import { voiceKey, voiceNoteUrl } from "./voice-store";
import { useSpeech } from "./speech";

/**
 * Two transports, one UI.
 *
 * - **eve mode** (when `/api/agent/enabled` says yes): durable server-side
 *   sessions proxied by the Worker. History is rebuilt from the session stream,
 *   so it survives a reload on the same device, and the agent can edit the trip
 *   documents.
 * - **fallback mode**: the original `useChat` → `POST /api/chat` AI SDK agent,
 *   with the transcript in sessionStorage.
 *
 * Both carry voice and file attachments: a recording is listened to by
 * `/api/transcribe` before either transport sees it, and images/PDFs are read
 * natively by the model on both sides.
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

type TransportError = {
  message: string;
  hint?: string;
  /** Overrides the icon/tone the card picks from the hint. */
  kind?: "offline" | "agent";
};

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
  const geo = useGeoContext();
  // Every turn leads with a `[הקשר: …]` part, so the agent knows when and where
  // the family is without them having to say so.
  const chat = useEveChat({ resolveContext: geo.resolveContextLine });

  const submit = useCallback((input: SendInput) => void chat.send(input), [chat]);

  const error: TransportError | null = chat.error
    ? { message: chat.error, kind: chat.errorKind ?? "agent" }
    : null;

  return (
    <ChatSurface
      messages={chat.messages}
      busy={chat.busy}
      hydrating={chat.hydrating}
      error={error}
      onSubmit={submit}
      onStop={chat.cancel}
      onReset={chat.messages.length > 0 || chat.hasSession ? chat.newChat : undefined}
      // A failed turn parks the session; the same question goes back on it.
      onRetry={chat.canRetry ? () => void chat.retry() : undefined}
      onRespond={(requestId, optionId) => void chat.respond(requestId, optionId)}
      geo={geo}
    />
  );
}

/* ============================================= AI SDK fallback transport */

function SdkConversation() {
  const geo = useGeoContext();
  const initialMessages = useMemo(() => loadStored(), []);
  const transport = useMemo(() => new DefaultChatTransport<TripUIMessage>({ api: "/api/chat" }), []);

  const { messages, sendMessage, status, error, stop, setMessages, clearError, regenerate } =
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
        const raw = messageText(message);
        // The context line rides inside the user's text here, so it has to be
        // peeled off again before the bubble is drawn.
        const user = message.role === "user";
        // Inlined text files are lifted back out into chips, exactly as the
        // durable transport does when it replays them.
        const lifted = user
          ? extractTextAttachments(stripContextLines(raw))
          : { text: raw, attachments: [] };
        const text = lifted.text;
        const last = index === messages.length - 1;

        return {
          id: message.id,
          role: user ? "user" : "assistant",
          text,
          audio: user && raw.includes(VOICE_CONTEXT_CLAUSE),
          attachments: user ? [...sdkAttachments(message), ...lifted.attachments] : [],
          activity: user ? [] : toolActivity(message),
          // The stateless fallback transport has no approval gate to render:
          // its tools run to completion inside one request.
          prompts: [],
          streaming: message.role === "assistant" && last && busy,
          final: message.role === "assistant" && !(last && busy) && text.trim().length > 0,
        };
      }),
    [messages, busy],
  );

  const submit = useCallback(
    (input: SendInput) => {
      const question = input.text?.trim() ?? "";
      const attachments = input.attachments ?? [];
      if (!question && attachments.length === 0) return;
      clearError();

      // A text attachment has no file part here either: no model reads a `.csv`
      // upload, so its contents ride in the prompt as words.
      const inlined = attachments
        .filter((attachment) => attachment.kind === "text")
        .map(textAttachmentPart);

      // `/api/chat` takes a plain UIMessage, so the same bracketed metadata
      // rides as the first line of the text instead of as its own part. It is
      // read with `peek`, never awaited: the fallback must not gain a GPS wait.
      void sendMessage({
        text: [geo.peekContextLine({ voice: input.spoken }), question, ...inlined]
          .filter(Boolean)
          .join("\n"),
        files: attachments
          .filter((attachment) => attachment.kind !== "text" && attachment.dataUrl)
          .map((attachment) => ({
            type: "file" as const,
            mediaType: attachment.mediaType,
            filename: attachment.name,
            url: attachment.dataUrl as string,
          })),
      });
    },
    [clearError, geo, sendMessage],
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
      // `regenerate` replays the last user turn against /api/chat, which is the
      // same "ask it again" the durable path offers.
      onRetry={
        error && bubbles.length > 0
          ? () => {
              clearError();
              void regenerate();
            }
          : undefined
      }
      geo={geo}
    />
  );
}

/** File parts the AI SDK kept on a user message, as bubble attachments. */
function sdkAttachments(message: TripUIMessage): BubbleAttachment[] {
  const files: BubbleAttachment[] = [];

  message.parts.forEach((part, index) => {
    if (part.type !== "file") return;
    const mediaType = part.mediaType ?? "";
    const kind = mediaType.startsWith("image/")
      ? "image"
      : mediaType === "application/pdf"
        ? "pdf"
        : null;
    if (!kind) return;

    files.push({
      id: `${message.id}:file:${index}`,
      kind,
      name: part.filename ?? (kind === "pdf" ? "מסמך.pdf" : "תמונה"),
      mediaType,
      url: part.url,
    });
  });

  return files;
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
  onRetry,
  onRespond,
  geo,
}: {
  messages: EveBubble[];
  busy: boolean;
  error: TransportError | null;
  hydrating?: boolean;
  onSubmit: (input: SendInput) => void;
  onStop: () => void;
  onReset?: () => void;
  onRetry?: () => void;
  /** Answers a parked approval or question. Absent on the stateless transport. */
  onRespond?: (requestId: string, optionId: string) => void;
  geo?: GeoContext;
}) {
  const [input, setInput] = useState("");
  const [offline, setOffline] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stickToBottom = useRef(true);

  const speech = useSpeech();
  const attachments = useComposerAttachments();

  /* ------------------------------------------------------------- send path */

  const blockedRef = useRef<SendInput | null>(null);

  const guardedSubmit = useCallback(
    (payload: SendInput) => {
      if (busy) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        // Held so the card's retry can send it once the signal is back.
        blockedRef.current = payload;
        setOffline(true);
        return;
      }
      blockedRef.current = null;
      setOffline(false);
      stickToBottom.current = true;
      onSubmit(payload);
    },
    [busy, onSubmit],
  );

  /** Whatever is staged right now: typed words plus the attachment tray. */
  const submitComposer = useCallback(
    (text: string, spoken = false) => {
      const question = text.trim();
      const files = attachments.items;
      if (!question && files.length === 0) return;

      setInput("");
      attachments.clear();
      attachments.clearError();
      guardedSubmit({ text: question, spoken, attachments: files });
    },
    [attachments, guardedSubmit],
  );

  // A voice turn carries the tray with it, so a photo and a spoken question
  // about that photo arrive together.
  const onTranscribed = useCallback(
    ({ text }: { text: string }) => submitComposer(text, true),
    [submitComposer],
  );

  const voice = useVoiceTurn(onTranscribed);

  const pickFiles = useCallback(() => fileInputRef.current?.click(), []);

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

  // One error card, fed by four sources. Local problems (a recording that could
  // not be heard, a file that could not be attached) win over a transport error
  // because they are the thing the family just did.
  const transportError: TransportError | null = offline
    ? { message: OFFLINE_MESSAGE, kind: "offline" }
    : voice.error
      ? { message: voice.error }
      : attachments.error
        ? { message: attachments.error }
        : error;

  const errorKind = transportError?.hint
    ? "setup"
    : (transportError?.kind ?? (offline ? "offline" : "generic"));

  /** Retry means "send that question again", whoever blocked it. */
  const retry = useCallback(() => {
    const blocked = blockedRef.current;
    if (blocked) {
      blockedRef.current = null;
      setOffline(false);
      guardedSubmit(blocked);
      return;
    }
    if (voice.canRetry) {
      // Re-listens to the recording that is still held, rather than asking the
      // family to say the whole thing again.
      voice.retry();
      return;
    }
    setOffline(false);
    onRetry?.();
  }, [guardedSubmit, onRetry, voice]);

  const showRetry =
    Boolean(transportError) && (offline || voice.canRetry || (!voice.error && Boolean(onRetry)));

  const dismissError = useCallback(() => {
    voice.clearError();
    attachments.clearError();
  }, [attachments, voice]);

  const canSend = Boolean(input.trim()) || attachments.items.length > 0;

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
          {voice.recording ? (
            <div className="chat-recording" role="status">
              <span className="chat-recording-dot" aria-hidden="true" />
              <span>מקליט… {formatElapsed(voice.elapsed)}</span>
              <span className="chat-recording-max">עד {MAX_RECORDING_SECONDS} שניות</span>
              <button type="button" className="chat-recording-cancel" onClick={voice.cancel}>
                ביטול
              </button>
            </div>
          ) : null}

          {voice.listening ? (
            <div className="chat-recording is-listening" role="status">
              <span className="chat-tool-spinner" aria-hidden="true" />
              <span>מקשיב להקלטה…</span>
              <button type="button" className="chat-recording-cancel" onClick={voice.cancel}>
                ביטול
              </button>
            </div>
          ) : null}

          <AttachmentTray items={attachments.items} busy={attachments.busy} onRemove={attachments.remove} />

          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              submitComposer(input);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="chat-file-input"
              accept={ACCEPT_ATTR}
              multiple
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                void attachments.add(event.target.files);
                // Lets the same file be picked twice in a row.
                event.target.value = "";
              }}
            />

            <textarea
              ref={textareaRef}
              className="chat-input"
              value={input}
              rows={1}
              placeholder={voice.recording ? "מקליט הודעה קולית…" : "שאלו כל דבר על הטיול…"}
              disabled={voice.recording}
              onChange={(event) => setInput(event.target.value)}
              // A screenshot pasted straight from the clipboard is the fastest
              // way to ask "what does this say?" while standing in a station.
              onPaste={(event) => {
                const files = Array.from(event.clipboardData.files);
                if (files.length === 0) return;
                event.preventDefault();
                void attachments.add(files);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submitComposer(input);
                }
              }}
            />

            <button
              type="button"
              className="chat-attach"
              onClick={pickFiles}
              disabled={voice.recording || attachments.busy}
              aria-label="צירוף תמונה, מסמך או קובץ"
              title="תמונה, צילום מסך, PDF או קובץ טקסט"
            >
              <Paperclip size={17} />
            </button>

            {geo?.supported ? (
              <button
                type="button"
                className={`chat-geo${geo.enabled ? " is-on" : ""}${
                  geo.enabled && geo.attached ? " is-live" : ""
                }`}
                onClick={geo.toggle}
                aria-pressed={geo.enabled}
                aria-label={geo.enabled ? "כיבוי שיתוף מיקום עם הסוכן" : "שיתוף מיקום עם הסוכן"}
                title="המיקום מצורף כדי שהסוכן ידע מה קרוב אליך"
              >
                {geo.enabled ? <MapPin size={16} /> : <MapPinOff size={16} />}
              </button>
            ) : null}

            {voice.supported && !busy ? (
              <button
                type="button"
                className={`chat-mic${voice.recording ? " is-recording" : ""}`}
                onClick={() => (voice.recording ? voice.stop() : voice.start())}
                aria-label={voice.recording ? "סיום הקלטה ושליחה" : "הקלטת הודעה קולית"}
                aria-pressed={voice.recording}
                disabled={voice.listening}
              >
                {voice.recording ? <Square size={15} fill="currentColor" /> : <Mic size={18} />}
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
                disabled={!canSend || voice.recording || voice.listening}
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
                  onClick={() => submitComposer(suggestion)}
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
          busy={busy}
          onSpeak={() =>
            speech.speakingId === message.id
              ? speech.stop()
              : void speech.speak(message.id, message.text)
          }
          onRespond={onRespond}
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
            {showRetry ? (
              <button type="button" className="chat-retry" onClick={retry} disabled={busy}>
                <RotateCw size={14} />
                {voice.canRetry ? "להאזין שוב" : "נסה שוב"}
              </button>
            ) : null}
          </div>
          {voice.error || attachments.error ? (
            <button
              type="button"
              className="chat-error-dismiss"
              onClick={dismissError}
              aria-label="סגירת ההודעה"
            >
              <X size={15} />
            </button>
          ) : null}
        </div>
      ) : null}
    </ChatShell>
  );
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/* --------------------------------------------------------- attachments UI */

/** Files staged in the composer, with a thumbnail for anything that has one. */
function AttachmentTray({
  items,
  busy,
  onRemove,
}: {
  items: readonly { id: string; kind: string; name: string; previewUrl?: string }[];
  busy: boolean;
  onRemove: (id: string) => void;
}) {
  if (items.length === 0 && !busy) return null;

  return (
    <ul className="chat-tray">
      {items.map((item) => (
        <li key={item.id} className="chat-tray-item">
          {item.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a blob: URL, not an optimisable asset
            <img src={item.previewUrl} alt="" className="chat-tray-thumb" />
          ) : (
            <span className="chat-tray-thumb chat-tray-icon" aria-hidden="true">
              <FileText size={18} />
            </span>
          )}
          <span className="chat-tray-name" title={item.name}>
            {item.name}
          </span>
          <button
            type="button"
            className="chat-tray-remove"
            onClick={() => onRemove(item.id)}
            aria-label={`הסרת ${item.name}`}
          >
            <X size={13} />
          </button>
        </li>
      ))}
      {busy ? (
        <li className="chat-tray-item is-busy">
          <span className="chat-tool-spinner" aria-hidden="true" />
          <span className="chat-tray-name">מכין את הקובץ…</span>
        </li>
      ) : null}
    </ul>
  );
}

/** Files that rode along with a sent message. */
function BubbleAttachments({ items }: { items: readonly BubbleAttachment[] }) {
  if (items.length === 0) return null;

  return (
    <ul className="chat-bubble-files">
      {items.map((item) =>
        item.kind === "image" && item.url ? (
          <li key={item.id} className="chat-bubble-file is-image">
            <a href={item.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- data:/blob: URL */}
              <img src={item.url} alt={item.name} />
            </a>
          </li>
        ) : (
          <li key={item.id} className="chat-bubble-file">
            <FileText size={15} />
            <span>{item.name}</span>
          </li>
        ),
      )}
    </ul>
  );
}

/**
 * Plays back the recording behind a spoken turn.
 *
 * The agent received the transcript, not the audio — eve cannot pass audio to
 * the model — so this is the only place the actual recording still exists. It is
 * looked up by transcript in the device's own store, which means it survives a
 * reload but not a different phone; nothing is rendered when it is missing.
 */
function VoicePlayback({ transcript }: { transcript: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void voiceNoteUrl(voiceKey(transcript)).then((found) => {
      if (live) setUrl(found);
    });
    return () => {
      live = false;
    };
  }, [transcript]);

  if (!url) return null;

  return <audio className="chat-voice-player" controls preload="metadata" src={url} />;
}

/** `×3` next to a status line that stands for more than one call. */
function ActivityCount({ count }: { count: number }) {
  if (count < 2) return null;
  // `dir` is forced: inside the RTL bubble the bidi algorithm would otherwise
  // flip this to `3×`.
  return (
    <span className="chat-tool-count" dir="ltr">
      ×{count}
    </span>
  );
}

/**
 * The approve / reject card for a run parked on a tool approval.
 *
 * This is the only control that can resolve one. eve's text fallback (a reply
 * matching an option label) cannot reach it through this app — the relay
 * prepends a `[הקשר: …]` clause to every message, and an approval is
 * `allowFreeform: false`, so unmatched text is held and the run stays parked
 * forever. Without these buttons the chat simply stops, which is exactly what
 * it used to do.
 */
function ApprovalCard({
  prompt,
  busy,
  onRespond,
}: {
  prompt: EvePrompt;
  busy: boolean;
  onRespond: (requestId: string, optionId: string) => void;
}) {
  // Live guide titles, so "להציע שינוי ב…" names the document the way the rest
  // of the app does. Convex's `useQuery` shares one subscription with the chat
  // hook's, so asking again here costs nothing.
  const copy = approvalCopy(
    prompt.toolName,
    prompt.toolInput,
    guideTitles(useQuery(api.trip.listGuides)),
  );
  // eve fixes these at `approve` / `deny`, but they are read off the request
  // rather than hardcoded so a renamed option cannot silently send the wrong one.
  const approve = prompt.options.find((option) => option.id === "approve") ?? prompt.options[0];
  const deny = prompt.options.find((option) => option.id === "deny") ?? prompt.options[1];

  return (
    <div className={`chat-approval${prompt.answered ? " is-answered" : ""}`}>
      <p className="chat-approval-title">
        <ShieldQuestion size={15} />
        {copy.title}
      </p>

      {copy.details.length > 0 ? (
        <dl className="chat-approval-details">
          {copy.details.map((detail) => (
            <div key={detail.label}>
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {prompt.answered ? (
        <p className="chat-approval-done">התשובה נשלחה.</p>
      ) : (
        <div className="chat-approval-actions">
          <button
            type="button"
            className="chat-approval-yes"
            disabled={busy || !approve}
            onClick={() => approve && onRespond(prompt.requestId, approve.id)}
          >
            <Check size={14} />
            {copy.confirm}
          </button>
          <button
            type="button"
            className="chat-approval-no"
            disabled={busy || !deny}
            onClick={() => deny && onRespond(prompt.requestId, deny.id)}
          >
            לא, בלי זה
          </button>
        </div>
      )}
    </div>
  );
}

/** One bubble: user text, or assistant tool activity + markdown answer. */
function ChatMessage({
  message,
  speaking,
  busy,
  onSpeak,
  onRespond,
}: {
  message: EveBubble;
  speaking: boolean;
  busy: boolean;
  onSpeak: () => void;
  onRespond?: (requestId: string, optionId: string) => void;
}) {
  if (message.role === "user") {
    return (
      <article className={`chat-bubble chat-bubble-user${message.audio ? " is-voice" : ""}`}>
        <BubbleAttachments items={message.attachments} />
        {message.text ? <p>{message.text}</p> : null}
        {message.audio ? <VoicePlayback transcript={message.text} /> : null}
      </article>
    );
  }

  const activity = message.activity;
  const answered = message.text.trim().length > 0;

  // Repeats of one line fold into a count, so a fifteen-call research turn
  // reads as a handful of steps instead of a wall of identical rows.
  const groups = groupActivity(activity);
  // While the agent is still working, only the tail is on screen: the newest
  // row is what it is doing *now*, and that is the row worth reading.
  const hiddenRows = Math.max(0, groups.length - ACTIVITY_LIVE_ROWS);
  const liveRows = hiddenRows > 0 ? groups.slice(hiddenRows) : groups;

  return (
    <article className="chat-bubble chat-bubble-assistant" aria-live="polite">
      {groups.length > 0 ? (
        answered ? (
          // Collapses into a step count once the answer starts streaming.
          <details className="chat-tools chat-tools-done">
            <summary>
              <Check size={13} />
              {groups.length === 1 ? "צעד אחד" : `${groups.length} צעדים`}
            </summary>
            <ul>
              {groups.map((group) => (
                <li key={group.id}>
                  {group.label}
                  <ActivityCount count={group.count} />
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <ul className="chat-tools chat-tools-live">
            {hiddenRows > 0 ? (
              <li className="is-done chat-tools-earlier">
                <Check size={13} />
                {hiddenRows === 1 ? "צעד קודם" : `${hiddenRows} צעדים קודמים`}
              </li>
            ) : null}
            {liveRows.map((group) => (
              <li key={group.id} className={group.done ? "is-done" : undefined}>
                {group.done ? <Check size={13} /> : <span className="chat-tool-spinner" />}
                {group.label}
                <ActivityCount count={group.count} />
                {group.done ? null : "…"}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {answered ? (
        <Markdown text={message.text} />
      ) : activity.length === 0 && message.prompts.length === 0 ? (
        <span className="chat-typing" aria-label="כותב תשובה">
          <i />
          <i />
          <i />
        </span>
      ) : null}

      {onRespond
        ? message.prompts.map((prompt) =>
            prompt.display === "confirmation" ? (
              <ApprovalCard
                key={prompt.requestId}
                prompt={prompt}
                busy={busy}
                onRespond={onRespond}
              />
            ) : prompt.options.length > 0 ? (
              // An `ask_question` with choices. The composer can answer it too,
              // but only when the model allowed free text — offering the buttons
              // costs nothing and is the only way through when it did not.
              <div key={prompt.requestId} className="chat-choices">
                {prompt.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    disabled={busy || prompt.answered}
                    onClick={() => onRespond(prompt.requestId, option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null,
          )
        : null}

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
