"use client";

import type { VoiceRecording } from "./useVoiceRecorder";

/**
 * Client half of the voice path: send the recording to `/api/transcribe` and get
 * words back.
 *
 * This step is not optional polish. eve stages attachments into the agent
 * sandbox and only re-inlines images and PDFs into the model call, so an audio
 * part arrives as a filename the model cannot open. Transcribing here is what
 * makes a spoken question a real question — and it doubles as the text the
 * bubble shows and the key the recording is stored under for playback.
 */

export class TranscriptionError extends Error {}

export type Transcription = {
  text: string;
  /** BCP-47-ish tag from the model, when it reports one. */
  language: string | null;
};

export async function transcribeRecording(
  recording: VoiceRecording,
  signal?: AbortSignal,
): Promise<Transcription> {
  let response: Response;
  try {
    response = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "content-type": recording.mediaType },
      body: recording.blob,
      signal,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new TranscriptionError("אין חיבור לשרת התמלול. בדקו את החיבור ונסו שוב.");
  }

  let body: { text?: unknown; language?: unknown; error?: unknown } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // Non-JSON body: the status is all the meaning there is.
  }

  if (!response.ok) {
    const message = typeof body.error === "string" ? body.error : "";
    throw new TranscriptionError(message || "התמלול נכשל. אפשר לנסות שוב או לכתוב את השאלה.");
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) throw new TranscriptionError("לא זיהינו דיבור בהקלטה. נסו שוב.");

  return { text, language: typeof body.language === "string" ? body.language : null };
}
