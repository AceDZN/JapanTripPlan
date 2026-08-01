"use client";

/**
 * Turning whatever the family picked on their phone into something the agent can
 * actually read.
 *
 * Three routes, decided by media type, because the two transports resolve files
 * very differently:
 *
 *  - **image** — re-encoded here to a bounded JPEG. eve stages attachments into
 *    the agent sandbox and only re-inlines `image/*` up to 3 MiB back into the
 *    model call (eve/dist/src/harness/attachment-staging.js), and a phone photo
 *    is several times that. Downscaling is what makes a photo readable at all,
 *    and it also keeps the durable session stream small — `message.received`
 *    echoes file parts back on every reconnect.
 *  - **pdf** — passed through untouched; both eve (≤20 MiB) and Claude read PDFs
 *    natively. Capped well below that by the platform request-body limit.
 *  - **text** — decoded to UTF-8 here and sent as *words*, not bytes. Nothing in
 *    either transport reads a `.txt`/`.csv`/`.json` attachment, but every model
 *    reads a quoted block, and the concierge has no filesystem tools.
 *
 * Anything else is rejected with a Hebrew reason rather than silently arriving
 * as an attachment the model cannot open.
 */

import { FILE_TEXT_CLOSE, FILE_TEXT_OPEN } from "./eve-protocol";

export type AttachmentKind = "image" | "pdf" | "text";

export type Attachment = {
  id: string;
  kind: AttachmentKind;
  /** Original filename, shown on the chip. */
  name: string;
  mediaType: string;
  /** base64 `data:` URL. Set for image/pdf — what goes on the wire. */
  dataUrl?: string;
  /** Decoded contents. Set for text, and inlined into the prompt instead. */
  text?: string;
  /** Payload size in bytes, after any re-encoding. */
  size: number;
  /** Object URL for the composer thumbnail. Revoked when the chip is dropped. */
  previewUrl?: string;
};

/** Thrown with copy that is already fit to show the family. */
export class AttachmentError extends Error {}

/**
 * Total raw bytes across one turn's attachments.
 *
 * The serverless request body limit is 4.5 MB and base64 inflates by 4/3, so
 * 3 MB of source material is the real ceiling once JSON framing is counted.
 */
export const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

/** A single PDF must still leave room for the rest of the turn. */
const MAX_PDF_BYTES = 2.5 * 1024 * 1024;
/** eve refuses to inline an image above this, so it is a hard ceiling. */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
/** Beyond this a "text file" is a data dump, not something to discuss. */
const MAX_TEXT_CHARS = 60_000;

export const ACCEPT_ATTR = "image/*,application/pdf,text/*,.md,.csv,.json,.txt";

/** Longest edge after downscaling. Enough for a menu or a signboard to stay legible. */
const IMAGE_MAX_EDGE = 1400;
const IMAGE_QUALITY = 0.72;
/** Second pass when the first is still heavy (a dense, noisy photo). */
const IMAGE_FALLBACK_EDGE = 1000;
const IMAGE_FALLBACK_QUALITY = 0.6;

const TEXT_TYPES = /^(text\/|application\/(json|xml|x-yaml|yaml|csv))/i;
const TEXT_EXTENSIONS = /\.(txt|md|markdown|csv|tsv|json|log|ics|vtt|srt)$/i;

export function classify(file: File): AttachmentKind | null {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (TEXT_TYPES.test(type) || TEXT_EXTENSIONS.test(file.name)) return "text";
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} ב׳`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ק״ב`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} מ״ב`;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `att-${Date.now().toString(36)}-${counter}`;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new AttachmentError("לא הצלחנו לקרוא את הקובץ."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

/** Approximate decoded size of a `data:` URL, without materialising the bytes. */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Re-encodes a picture to a bounded JPEG.
 *
 * A source the browser cannot decode (HEIC outside Safari, mostly) surfaces as a
 * Hebrew error rather than being uploaded as bytes no model will open.
 */
async function shrinkImage(file: File): Promise<{ blob: Blob; mediaType: string }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AttachmentError(
      `לא הצלחנו לפתוח את התמונה (${file.type || "פורמט לא מוכר"}). נסו לשמור אותה כ־JPG ולצרף שוב.`,
    );
  }

  const encode = async (maxEdge: number, quality: number): Promise<Blob | null> => {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d");
    if (!context) return null;
    // White underlay: a transparent PNG screenshot would otherwise flatten to
    // black and become unreadable.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    return canvasToBlob(canvas, quality);
  };

  try {
    let blob = await encode(IMAGE_MAX_EDGE, IMAGE_QUALITY);
    if (blob && blob.size > 1.2 * 1024 * 1024) {
      blob = (await encode(IMAGE_FALLBACK_EDGE, IMAGE_FALLBACK_QUALITY)) ?? blob;
    }

    if (!blob) {
      // No canvas encoder: the original is still usable if it is small enough.
      if (file.size <= MAX_IMAGE_BYTES) return { blob: file, mediaType: file.type };
      throw new AttachmentError("התמונה גדולה מדי לשליחה מהמכשיר הזה.");
    }

    if (blob.size > MAX_IMAGE_BYTES) {
      throw new AttachmentError("התמונה גדולה מדי גם אחרי כיווץ. נסו תמונה קטנה יותר.");
    }

    return { blob, mediaType: "image/jpeg" };
  } finally {
    bitmap.close();
  }
}

/** Prepares one picked file, or throws an `AttachmentError` worth showing. */
export async function prepareAttachment(file: File): Promise<Attachment> {
  const kind = classify(file);
  if (!kind) {
    throw new AttachmentError(
      `אפשר לצרף תמונות, PDF וקבצי טקסט. הקובץ "${file.name}" הוא מסוג ${file.type || "לא מוכר"}.`,
    );
  }

  if (kind === "text") {
    const raw = await file.text();
    const text = raw.length > MAX_TEXT_CHARS ? `${raw.slice(0, MAX_TEXT_CHARS)}\n…[הקובץ נחתך]` : raw;
    if (!text.trim()) throw new AttachmentError(`הקובץ "${file.name}" ריק.`);
    return { id: nextId(), kind, name: file.name, mediaType: file.type || "text/plain", text, size: text.length };
  }

  if (kind === "pdf") {
    if (file.size > MAX_PDF_BYTES) {
      throw new AttachmentError(
        `ה־PDF גדול מדי (${formatBytes(file.size)}). המקסימום הוא ${formatBytes(MAX_PDF_BYTES)}.`,
      );
    }
    const dataUrl = await blobToDataUrl(file);
    return {
      id: nextId(),
      kind,
      name: file.name,
      mediaType: "application/pdf",
      dataUrl,
      size: file.size,
    };
  }

  const { blob, mediaType } = await shrinkImage(file);
  const dataUrl = await blobToDataUrl(blob);

  return {
    id: nextId(),
    kind,
    name: file.name,
    mediaType,
    dataUrl,
    size: blob.size,
    previewUrl: URL.createObjectURL(blob),
  };
}

/** Bytes actually going on the wire, text included. */
export function attachmentBytes(list: readonly Attachment[]): number {
  return list.reduce((total, item) => total + item.size, 0);
}

/**
 * How a text file reaches the model: as a quoted block introduced in Hebrew, so
 * the agent knows the words came from a file the family attached and not from
 * the trip documents. The chat lifts this exact fence back out when it draws the
 * bubble — the delimiters live in eve-protocol so both halves cannot drift.
 */
export function textAttachmentPart(attachment: Attachment): string {
  return [
    `${FILE_TEXT_OPEN} "${attachment.name}" ---`,
    attachment.text ?? "",
    FILE_TEXT_CLOSE,
  ].join("\n");
}

/** Frees the composer thumbnails. Safe to call on an attachment without one. */
export function releaseAttachment(attachment: Attachment): void {
  if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
}
