"use client";

import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  ArrowUp,
  MessageCirclePlus,
  Sparkles,
  Square,
  WifiOff,
} from "lucide-react";
import { Markdown } from "./Markdown";

type Role = "user" | "assistant";
type Message = { id: string; role: Role; content: string };
type ChatError = { message: string; hint?: string; kind: "offline" | "setup" | "generic" };

const STORAGE_KEY = "japan2026.chat.v1";

const SUGGESTIONS = [
  "מה התוכנית ל־5 באוקטובר?",
  "איפה אוכלים ליד מוזיאון ג׳יבלי?",
  "מה עוד לא הזמנו?",
  "מה עושים אם יורד גשם ביום 7?",
];

let idCounter = 0;
const nextId = () => {
  idCounter += 1;
  return `m${Date.now().toString(36)}-${idCounter}`;
};

function loadStored(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): Message[] => {
      if (typeof entry !== "object" || entry === null) return [];
      const { role, content } = entry as { role?: unknown; content?: unknown };
      if ((role !== "user" && role !== "assistant") || typeof content !== "string") return [];
      return [{ id: nextId(), role, content }];
    });
  } catch {
    return [];
  }
}

/* Lets the conversation mount client-only, so its state can be seeded straight
   from sessionStorage without an SSR mismatch (and without setState-in-effect). */
const subscribeNoop = () => () => {};
const onClient = () => true;
const onServer = () => false;

export function ChatView() {
  const ready = useSyncExternalStore(subscribeNoop, onClient, onServer);
  if (ready) return <ChatConversation />;

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

function ChatHeader({ onReset }: { onReset?: () => void }) {
  return (
    <header className="chat-head">
      <div className="chat-head-title">
        <span className="chat-head-mark" aria-hidden="true">
          日
        </span>
        <div>
          <h1>צ׳אט הטיול</h1>
          <p>שואלים בעברית — התשובות מגיעות ממסמכי התכנון של המסע.</p>
        </div>
      </div>
      {onReset ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>
          <MessageCirclePlus size={16} />
          שיחה חדשה
        </button>
      ) : null}
    </header>
  );
}

function ChatConversation() {
  const [messages, setMessages] = useState<Message[]>(loadStored);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stickToBottom = useRef(true);

  /* -------------------------------------------------- session persistence */

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(messages.map(({ role, content }) => ({ role, content }))),
      );
    } catch {
      // sessionStorage can be unavailable (private mode); the chat still works.
    }
  }, [messages]);

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
  }, [messages, streaming]);

  /* ---------------------------------------------------------------- send */

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || streaming) return;

      setError(null);

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setMessages((prev) => [...prev, { id: nextId(), role: "user", content: question }]);
        setInput("");
        setError({
          kind: "offline",
          message: "אין חיבור לאינטרנט, אז אי אפשר לשאול כרגע. המסלול והמדריכים עדיין זמינים אופליין.",
        });
        return;
      }

      const userMessage: Message = { id: nextId(), role: "user", content: question };
      const history = [...messages, userMessage];
      const assistantId = nextId();

      setMessages([...history, { id: assistantId, role: "assistant", content: "" }]);
      setInput("");
      setStreaming(true);
      stickToBottom.current = true;

      const controller = new AbortController();
      abortRef.current = controller;

      const appendChunk = (chunk: string) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m)),
        );
      };

      const dropEmptyAssistant = () => {
        setMessages((prev) => prev.filter((m) => !(m.id === assistantId && !m.content)));
      };

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            messages: history.map(({ role, content }) => ({ role, content })),
          }),
        });

        if (!response.ok || !response.body) {
          let payload: { error?: string; hint?: string } = {};
          try {
            payload = (await response.json()) as { error?: string; hint?: string };
          } catch {
            // non-JSON error body — fall through to the generic message
          }
          dropEmptyAssistant();
          setError({
            kind: response.status === 503 ? "setup" : "generic",
            message: payload.error ?? "משהו השתבש בדרך לצ׳אט. נסו שוב בעוד רגע.",
            hint: payload.hint,
          });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let received = false;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newline = buffer.indexOf("\n");
          while (newline !== -1) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");

            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;

            let event: { type?: string; text?: string; message?: string };
            try {
              event = JSON.parse(raw) as typeof event;
            } catch {
              continue;
            }

            if (event.type === "delta" && event.text) {
              received = true;
              appendChunk(event.text);
            } else if (event.type === "error") {
              setError({
                kind: "generic",
                message: event.message ?? "משהו השתבש באמצע התשובה.",
              });
            }
          }
        }

        if (!received) {
          dropEmptyAssistant();
          setError((prev) =>
            prev ?? {
              kind: "generic",
              message: "לא הגיעה תשובה מהצ׳אט. נסו לשאול שוב.",
            },
          );
        }
      } catch (caught) {
        if ((caught as Error)?.name === "AbortError") {
          dropEmptyAssistant();
          return;
        }
        dropEmptyAssistant();
        setError({
          kind: "offline",
          message: "החיבור נקטע. בדקו את האינטרנט ונסו שוב.",
        });
      } finally {
        abortRef.current = null;
        setStreaming(false);
      }
    },
    [messages, streaming],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setInput("");
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    textareaRef.current?.focus();
  }, []);

  /* ------------------------------------------------------------ composer */

  const autosize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, []);

  useEffect(() => {
    autosize();
  }, [input, autosize]);

  const isEmpty = messages.length === 0;

  return (
    <ChatShell
      head={<ChatHeader onReset={isEmpty ? undefined : reset} />}
      scrollerRef={scrollerRef}
      onScroll={handleScroll}
      composer={
        <form
          className="chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
        >
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={input}
            rows={1}
            placeholder="שאלו כל דבר על הטיול…"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send(input);
              }
            }}
          />
          {streaming ? (
            <button
              type="button"
              className="chat-send chat-send-stop"
              onClick={stop}
              aria-label="עצירת התשובה"
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button type="submit" className="chat-send" disabled={!input.trim()} aria-label="שליחה">
              <ArrowUp size={19} />
            </button>
          )}
        </form>
      }
    >
      {isEmpty ? (
        <div className="chat-empty">
          <span className="chat-empty-mark">
            <Sparkles size={30} strokeWidth={1.6} />
          </span>
          <h2>מה בא לכם לדעת?</h2>
          <p>
            המדריך מכיר את כל 17 הימים, ההזמנות, המסעדות והתחבורה — ומצטט מהמסמכים עצמם.
            הוא לא ימציא מחירים או אישורי הזמנה.
          </p>
          <ul className="chat-suggestions">
            {SUGGESTIONS.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  className="chip chat-suggestion"
                  onClick={() => void send(suggestion)}
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {messages.map((message) => (
        <article
          key={message.id}
          className={`chat-bubble chat-bubble-${message.role}`}
          aria-live={message.role === "assistant" ? "polite" : undefined}
        >
          {message.role === "assistant" ? (
            message.content ? (
              <Markdown text={message.content} />
            ) : (
              <span className="chat-typing" aria-label="כותב תשובה">
                <i />
                <i />
                <i />
              </span>
            )
          ) : (
            <p>{message.content}</p>
          )}
        </article>
      ))}

      {error ? (
        <div
          className={`chat-error${error.kind === "setup" ? " chat-error-setup" : ""}`}
          role="alert"
        >
          <span className="chat-error-icon" aria-hidden="true">
            {error.kind === "offline" ? <WifiOff size={17} /> : <AlertTriangle size={17} />}
          </span>
          <div>
            <strong>{error.message}</strong>
            {error.hint ? <code>{error.hint}</code> : null}
          </div>
        </div>
      ) : null}
    </ChatShell>
  );
}
