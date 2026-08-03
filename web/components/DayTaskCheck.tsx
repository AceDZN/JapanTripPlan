"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Unauthenticated, useConvexAuth, useMutation } from "convex/react";
import { Check, Loader2, LogIn } from "lucide-react";
import { api } from "@/convex/_generated/api";

/**
 * The one interactive atom of the day's task panel: a single tick box.
 *
 * Everything else about a task — its title, detail, deadline badges, links,
 * who ticked it — is server-rendered in `DayTasks.tsx`. This is the smallest
 * possible client boundary: it exists because writing needs a mutation and an
 * auth check, and for no other reason.
 *
 * ## How the row still looks "done" instantly
 *
 * Without local state the parent `<li>` could not react to a tick until the
 * server re-rendered. Rather than lifting state up (which would drag the whole
 * list across the boundary), the strike-through is pure CSS keyed off this
 * button's own `aria-pressed` — see `.day-task:has(...)` in globals.css. The
 * button owns its optimistic state, the stylesheet does the rest, and
 * `router.refresh()` reconciles the server truth (including "סומן על ידי")
 * a moment later.
 */
export function DayTaskCheck({
  itemSlug,
  done,
  title,
}: {
  itemSlug: string;
  done: boolean;
  title: string;
}) {
  const { isAuthenticated } = useConvexAuth();
  const setDone = useMutation(api.checklist.setDone);
  const router = useRouter();

  // Seeded from the server render; diverges only between a click and the
  // refresh that follows it.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const checked = optimistic ?? done;

  async function toggle() {
    if (!isAuthenticated || pending) return;
    const next = !checked;
    setOptimistic(next);
    setPending(true);
    try {
      await setDone({ itemSlug, done: next });
      router.refresh();
    } catch {
      setOptimistic(null); // put it back; the server never took the change
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      className="prep-check"
      aria-pressed={checked}
      aria-label={`סימון: ${title}`}
      disabled={!isAuthenticated || pending}
      title={isAuthenticated ? undefined : "צריך להתחבר כדי לסמן"}
      onClick={() => void toggle()}
    >
      {pending ? <Loader2 size={15} className="spin" /> : <Check size={16} />}
    </button>
  );
}

/** The "you need to sign in to tick" note, shown only when that is true. */
export function DayTasksSignIn() {
  return (
    <Unauthenticated>
      <p className="day-tasks-signin">
        <LogIn size={13} />
        <Link className="text-link" href="/sign-in">
          להתחבר
        </Link>{" "}
        כדי לסמן.
      </p>
    </Unauthenticated>
  );
}
