import type { Metadata } from "next";
import { GitPullRequest } from "lucide-react";
import { SuggestionQueue } from "@/components/SuggestionQueue";

export const metadata: Metadata = {
  title: "הצעות לשינוי",
  description: "שינויים בתוכנית שממתינים לאישור.",
  robots: { index: false, follow: false },
};

/**
 * The review queue for changes to the shared plan.
 *
 * Shell is public so the route stays precacheable like every other page; the
 * data behind it is not. Every query runs through requireFamily(), and the
 * approve/reject mutations additionally demand `role === "owner"` — so a
 * signed-out visitor, or a signed-in kid, sees the page and gets nothing they
 * should not have.
 */
export default function SuggestionsPage() {
  return (
    <div className="container section">
      <header className="section-head">
        <p className="eyebrow">
          <GitPullRequest size={14} />
          ממתין להחלטה
        </p>
        <h1 className="display">הצעות לשינוי</h1>
        <p className="lede">
          כשמישהו מבקש מ‑eve לשנות משהו במדריכים או במסלול, הבקשה נרשמת כאן
          ומחכה. התוכנית עצמה לא משתנה עד שאלכס מאשר.
        </p>
      </header>

      <SuggestionQueue />
    </div>
  );
}
