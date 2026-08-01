"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Records a short voice note with MediaRecorder and hands back the raw blob.
 *
 * The blob goes two places: to `/api/transcribe`, which turns it into the words
 * the agent actually receives, and to IndexedDB, so the family can play their
 * own question back (see voice-store.ts). Neither wants a base64 `data:` URL,
 * so none is built.
 *
 * Opus-in-WebM is preferred (small, and transcribes well); Safari only offers
 * MP4/AAC, so the list degrades to whatever the browser will actually record.
 */

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/mpeg",
];

/** Hard cap. A voice question longer than this is a conversation, not a prompt. */
export const MAX_RECORDING_SECONDS = 60;

export type RecorderStatus = "idle" | "requesting" | "recording";

/** What one finished recording hands back. */
export type VoiceRecording = {
  blob: Blob;
  /** Container/codec family, without codec parameters. */
  mediaType: string;
  durationMs: number;
};

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  });
}

/** Whether this browser can record something the agent can actually read. */
function detectSupport(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    Boolean(pickMimeType())
  );
}

export function useVoiceRecorder(onComplete: (recording: VoiceRecording) => void) {
  const [supported] = useState<boolean>(detectSupport);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(0);
  const keepRef = useRef(true);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    timerRef.current = null;
    stopTimerRef.current = null;
  }, []);

  const stop = useCallback(() => {
    keepRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    keepRef.current = false;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (status !== "idle") return;

    const mimeType = pickMimeType();
    if (!mimeType) {
      setError("הדפדפן הזה לא תומך בהקלטה. אפשר לכתוב את השאלה.");
      return;
    }

    setError(null);
    setStatus("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus("idle");
      setError("אין הרשאה למיקרופון. אפשרו גישה בהגדרות הדפדפן ונסו שוב.");
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    chunksRef.current = [];
    keepRef.current = true;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      clearTimers();
      stream.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      setStatus("idle");
      setElapsed(0);

      const chunks = chunksRef.current;
      chunksRef.current = [];
      if (!keepRef.current || chunks.length === 0) return;

      const blob = new Blob(chunks, { type: mimeType });
      // Silence or a mis-fire: not worth a round trip.
      if (blob.size < 1200) {
        setError("ההקלטה קצרה מדי. החזיקו רגע ארוך יותר.");
        return;
      }

      // The media type is reported without codec parameters — the transcription
      // endpoint only needs the container family.
      onCompleteRef.current({
        blob,
        mediaType: mimeType.split(";")[0],
        durationMs: Date.now() - startedAtRef.current,
      });
    };

    recorder.start();
    startedAtRef.current = Date.now();
    setStatus("recording");
    setElapsed(0);

    timerRef.current = setInterval(() => setElapsed((value) => value + 1), 1000);
    stopTimerRef.current = setTimeout(() => {
      keepRef.current = true;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    }, MAX_RECORDING_SECONDS * 1000);
  }, [clearTimers, status]);

  useEffect(
    () => () => {
      clearTimers();
      if (recorderRef.current?.state === "recording") {
        keepRef.current = false;
        recorderRef.current.stop();
      }
    },
    [clearTimers],
  );

  return {
    supported,
    status,
    recording: status === "recording",
    elapsed,
    error,
    clearError: useCallback(() => setError(null), []),
    start,
    stop,
    cancel,
  };
}
