"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AttachmentError,
  MAX_TOTAL_BYTES,
  attachmentBytes,
  formatBytes,
  prepareAttachment,
  releaseAttachment,
  type Attachment,
} from "./attachments";

/**
 * The composer's staging tray: files the family picked but has not sent yet.
 *
 * Preparation (downscaling a photo, decoding a text file) happens the moment a
 * file is picked rather than at send time, so the size verdict and any error
 * land while they are still looking at the picker — and so the send itself stays
 * instant.
 */

/** How many files one turn may carry. Beyond this the model loses the thread. */
const MAX_FILES = 4;

export type ComposerAttachments = {
  items: Attachment[];
  /** At least one file is still being downscaled or decoded. */
  busy: boolean;
  error: string | null;
  add: (files: FileList | File[] | null) => Promise<void>;
  remove: (id: string) => void;
  /**
   * Empties the tray after a send. Preview URLs are deliberately *not* revoked:
   * the sent bubble is now drawing from them, and it keeps doing so until eve
   * confirms the turn and replays the attachment from the stream.
   */
  clear: () => void;
  clearError: () => void;
};

export function useComposerAttachments(): ComposerAttachments {
  const [items, setItems] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirrors `items` for the async add path, which must not close over stale
  // state while several files are being prepared in sequence.
  const itemsRef = useRef<Attachment[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(
    () => () => {
      itemsRef.current.forEach(releaseAttachment);
    },
    [],
  );

  const add = useCallback(async (files: FileList | File[] | null) => {
    const picked = Array.from(files ?? []);
    if (picked.length === 0) return;

    setError(null);
    setBusy(true);

    try {
      for (const file of picked) {
        const current = itemsRef.current;

        if (current.length >= MAX_FILES) {
          setError(`אפשר לצרף עד ${MAX_FILES} קבצים בהודעה אחת.`);
          break;
        }

        try {
          const attachment = await prepareAttachment(file);

          if (attachmentBytes(current) + attachment.size > MAX_TOTAL_BYTES) {
            releaseAttachment(attachment);
            setError(`הקבצים יחד גדולים מדי (המקסימום ${formatBytes(MAX_TOTAL_BYTES)}).`);
            break;
          }

          itemsRef.current = [...current, attachment];
          setItems(itemsRef.current);
        } catch (failure) {
          setError(
            failure instanceof AttachmentError
              ? failure.message
              : `לא הצלחנו לצרף את "${file.name}".`,
          );
          break;
        }
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const remove = useCallback((id: string) => {
    const target = itemsRef.current.find((item) => item.id === id);
    if (target) releaseAttachment(target);

    itemsRef.current = itemsRef.current.filter((item) => item.id !== id);
    setItems(itemsRef.current);
    setError(null);
  }, []);

  const clear = useCallback(() => {
    // Ownership of the preview URLs passes to the bubble — see the type above.
    itemsRef.current = [];
    setItems([]);
  }, []);

  return {
    items,
    busy,
    error,
    add,
    remove,
    clear,
    clearError: useCallback(() => setError(null), []),
  };
}
