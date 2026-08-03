"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/**
 * Copy a Japanese address or phone number to the clipboard.
 *
 * The whole point of storing `addressJa` is handing it to someone — a driver,
 * a maps app, a delivery form — and retyping Japanese on a Hebrew keyboard at
 * midnight is not a plan.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="copy-btn"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard is blocked (insecure context, denied permission). The
          // text is on screen and selectable, so silence beats an error toast.
        }
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "הועתק" : "העתקה"}
    </button>
  );
}
