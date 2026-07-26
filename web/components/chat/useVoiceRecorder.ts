"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceAttachment } from "./useEveChat";

/**
 * Records a short voice note with MediaRecorder and hands back a base64
 * `data:` URL, which is exactly what an eve file part wants.
 *
 * Opus-in-WebM is preferred (small, and understood natively by Gemini on the
 * agent side); Safari only offers MP4/AAC, so the list degrades to whatever the
 * browser will actually record.
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
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

export function useVoiceRecorder(onComplete: (attachment: VoiceAttachment) => void) {
  const [supported] = useState<boolean>(detectSupport);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

      void blobToDataUrl(blob)
        .then((dataUrl) => {
          // The media type is sent without codec parameters — the agent side
          // only needs the container/codec family.
          onCompleteRef.current({ dataUrl, mediaType: mimeType.split(";")[0] });
        })
        .catch(() => setError("לא הצלחנו לקרוא את ההקלטה. נסו שוב."));
    };

    recorder.start();
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
