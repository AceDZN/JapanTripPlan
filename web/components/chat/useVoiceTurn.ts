"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeRecording, TranscriptionError } from "./transcribe";
import { useVoiceRecorder, type VoiceRecording } from "./useVoiceRecorder";
import { primeVoiceNoteUrl, saveVoiceNote, voiceKey } from "./voice-store";

/**
 * The whole voice path, from holding the mic to a turn on the wire.
 *
 *   record → an audio-native model listens → the words are sent as a spoken turn
 *          ↘ the recording is kept on the device so the bubble can play it back
 *
 * The listening step is not a stylistic choice: eve stages attachments into the
 * agent sandbox and only re-inlines images and PDFs into the model call, so raw
 * audio reaches the agent as a filename it cannot open. See
 * app/api/transcribe/route.ts for the full reasoning.
 *
 * A failed listen keeps the recording, so "נסה שוב" re-listens to the same audio
 * instead of asking the family to say it again.
 */

export type VoiceTurn = {
  supported: boolean;
  recording: boolean;
  /** Seconds recorded so far. */
  elapsed: number;
  /** The recording is with the model right now. */
  listening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
  cancel: () => void;
  /** Re-listens to the recording held after a failure. */
  retry: () => void;
  clearError: () => void;
  /** True while there is a recording a retry could still use. */
  canRetry: boolean;
};

export function useVoiceTurn(
  onTranscribed: (input: { text: string; spoken: true }) => void,
): VoiceTurn {
  const [listening, setListening] = useState(false);
  /** Only failures from the listening step; the recorder reports its own. */
  const [listenError, setListenError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);

  /** Held after a failed listen so the audio can be re-sent, not re-recorded. */
  const heldRef = useRef<VoiceRecording | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onTranscribedRef = useRef(onTranscribed);

  useEffect(() => {
    onTranscribedRef.current = onTranscribed;
  }, [onTranscribed]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const listen = useCallback(async (recording: VoiceRecording) => {
    heldRef.current = recording;
    setCanRetry(false);
    setListenError(null);
    setListening(true);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    try {
      const { text } = await transcribeRecording(recording, controller.signal);
      if (controller.signal.aborted) return;

      // Stored under the transcript, which is the one thing the bubble still has
      // after the session is replayed from the durable stream on a reload.
      const key = voiceKey(text);
      primeVoiceNoteUrl(key, recording.blob);
      void saveVoiceNote({
        key,
        blob: recording.blob,
        mediaType: recording.mediaType,
        durationMs: recording.durationMs,
        at: Date.now(),
      });

      heldRef.current = null;
      onTranscribedRef.current({ text, spoken: true });
    } catch (failure) {
      if ((failure as Error)?.name === "AbortError") return;
      setListenError(
        failure instanceof TranscriptionError
          ? failure.message
          : "לא הצלחנו להאזין להקלטה. אפשר לנסות שוב או לכתוב את השאלה.",
      );
      setCanRetry(true);
    } finally {
      if (!controller.signal.aborted) setListening(false);
    }
  }, []);

  const onRecorded = useCallback(
    (recording: VoiceRecording) => void listen(recording),
    [listen],
  );

  const recorder = useVoiceRecorder(onRecorded);

  const retry = useCallback(() => {
    const held = heldRef.current;
    if (held) void listen(held);
  }, [listen]);

  const clearError = useCallback(() => {
    setListenError(null);
    recorder.clearError();
  }, [recorder]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    heldRef.current = null;
    setCanRetry(false);
    setListening(false);
    setListenError(null);
    recorder.cancel();
  }, [recorder]);

  return {
    supported: recorder.supported,
    recording: recorder.recording,
    elapsed: recorder.elapsed,
    listening,
    // The recorder's own problems (no permission, too short) already read well.
    error: listenError ?? recorder.error,
    start: useCallback(() => void recorder.start(), [recorder]),
    stop: recorder.stop,
    cancel,
    retry,
    clearError,
    canRetry,
  };
}
