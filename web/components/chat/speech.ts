"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reading answers out loud.
 *
 * Primary path: POST /api/tts, which runs AI SDK `generateSpeech` through the
 * Vercel AI Gateway and returns MP3. Fallback: the browser's own
 * `speechSynthesis` with `he-IL`, so the feature still does something when the
 * Gateway key is missing, the request fails, or the device is offline.
 */

const SPEAK_KEY = "japan2026.chat.speak.v1";

/** Matches the server-side clamp; one call, one paragraph-sized chunk. */
export const TTS_MAX_CHARS = 1000;

/** Strips the markdown the agent writes so the voice does not read syntax. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/^\s*([-*_]\s*){3,}$/gm, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Clamps to one TTS call, cutting on a sentence boundary when there is one. */
export function clampForSpeech(text: string, limit: number = TTS_MAX_CHARS): string {
  const clean = stripMarkdown(text);
  if (clean.length <= limit) return clean;

  const head = clean.slice(0, limit);
  const cut = Math.max(head.lastIndexOf("."), head.lastIndexOf("!"), head.lastIndexOf("?"), head.lastIndexOf("\n"));
  return (cut > limit * 0.5 ? head.slice(0, cut + 1) : head).trim();
}

function readStoredPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SPEAK_KEY) === "1";
  } catch {
    return false;
  }
}

function browserSpeak(text: string): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "he-IL";
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

function browserStop(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // nothing to cancel
    }
  }
}

export function useSpeech() {
  // Read lazily rather than in an effect: this hook only ever runs on the
  // client (the chat mounts behind a client-only gate), so there is no SSR
  // markup to mismatch.
  const [autoSpeak, setAutoSpeak] = useState<boolean>(readStoredPreference);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const release = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    browserStop();
  }, []);

  const stop = useCallback(() => {
    release();
    setSpeakingId(null);
  }, [release]);

  const speak = useCallback(
    async (id: string, text: string) => {
      const spoken = clampForSpeech(text);
      if (!spoken) return;

      release();
      setSpeakingId(id);

      const controller = new AbortController();
      requestRef.current = controller;

      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: spoken }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`tts ${response.status}`);

        const blob = await response.blob();
        if (controller.signal.aborted) return;

        const url = URL.createObjectURL(blob);
        urlRef.current = url;

        // A fresh element per answer: the previous object URL is revoked in
        // `release()`, so nothing accumulates.
        const audio = new Audio(url);
        audio.onended = () => setSpeakingId((current) => (current === id ? null : current));
        audio.onerror = () => setSpeakingId((current) => (current === id ? null : current));
        audioRef.current = audio;
        await audio.play();
      } catch (error) {
        if (controller.signal.aborted || (error as Error)?.name === "AbortError") return;

        // Gateway key missing, quota exhausted, offline — the device can still read.
        if (!browserSpeak(spoken)) setSpeakingId(null);
        else window.setTimeout(() => setSpeakingId((current) => (current === id ? null : current)), Math.min(spoken.length * 90, 60_000));
      }
    },
    [release],
  );

  const toggleAutoSpeak = useCallback(() => {
    setAutoSpeak((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SPEAK_KEY, next ? "1" : "0");
      } catch {
        // preference simply will not survive a reload
      }
      if (!next) {
        release();
        setSpeakingId(null);
      }
      return next;
    });
  }, [release]);

  useEffect(() => () => release(), [release]);

  return { autoSpeak, toggleAutoSpeak, speak, stop, speakingId };
}
