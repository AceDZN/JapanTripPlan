import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { MoneyBoard } from "@/components/MoneyBoard";

export const metadata: Metadata = {
  title: "כספים",
  description: "מה תוכנן, מה שולם ומה עוד ממתין — מעטפות התקציב מול הפנקס האמיתי.",
  robots: { index: false, follow: false },
};

/**
 * The money page.
 *
 * The shell is public so the route stays precacheable like every other page;
 * the data behind it is not — every query goes through requireFamily(), and a
 * signed-out visitor sees only the invitation to sign in. Same shape as
 * /wishes and /private.
 */
export default function MoneyPage() {
  return (
    <div className="container section">
      <header className="section-head">
        <p className="eyebrow">
          <Wallet size={14} />
          רק למשפחה
        </p>
        <h1 className="display">כספים</h1>
        <p className="lede">
          מצד אחד מעטפות התכנון ממדריך התקציב, מהצד השני מה שבאמת ירד מהכרטיס. שני
          הצדדים אף פעם לא מתערבבים — ככה רואים באמת אם חרגנו.
        </p>
      </header>

      <MoneyBoard />
    </div>
  );
}
