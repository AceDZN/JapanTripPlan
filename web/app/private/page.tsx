import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { PrivateVault } from "@/components/PrivateVault";

export const metadata: Metadata = {
  title: "הכספת המשפחתית",
  description: "קישורי כרטיסים, אישורי הזמנות, כתובות וקודי כניסה — גלויים רק למשפחה.",
  robots: { index: false, follow: false },
};

/**
 * The private area.
 *
 * The page itself is public — it has to be, so it stays precacheable like
 * every other route and does not put a login wall in front of the app while
 * the family is walking around Tokyo. The *data* is what is protected: every
 * query behind it goes through requireFamily(), so a signed-out visitor sees
 * only the invitation to sign in.
 */
export default function PrivatePage() {
  return (
    <div className="container section">
      <header className="section-head">
        <p className="eyebrow">
          <ShieldCheck size={14} />
          רק למשפחה
        </p>
        <h1 className="display">הכספת</h1>
        <p className="lede">
          כל מה שלא צריך להיות במסלול הפומבי: קישורי כרטיסים, אישורי הזמנות,
          כתובות הדירות, קודי כניסה ופרטי דרכונים.
        </p>
      </header>

      <PrivateVault />
    </div>
  );
}
