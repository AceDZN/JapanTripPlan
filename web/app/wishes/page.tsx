import type { Metadata } from "next";
import { Heart } from "lucide-react";
import { WishBoard } from "@/components/WishBoard";

export const metadata: Metadata = {
  title: "מה אנחנו רוצים",
  description: "הרשימה המשפחתית: אטרקציות, מקומות ומוצרים שכל אחד רוצה — משותף או פרטי.",
  robots: { index: false, follow: false },
};

/**
 * The wish list.
 *
 * The page shell is public so it stays precacheable like every other route;
 * the data behind it is not — every query goes through requireFamily(), and a
 * signed-out visitor sees only the invitation to sign in.
 */
export default function WishesPage() {
  return (
    <div className="container section">
      <header className="section-head">
        <p className="eyebrow">
          <Heart size={14} />
          רק למשפחה
        </p>
        <h1 className="display">מה אנחנו רוצים</h1>
        <p className="lede">
          כל אחד מוסיף מה שהוא רוצה — אטרקציה, מקום, אוכל או מוצר ספציפי. מה
          שמשותף נכנס לשיקולים של התכנון; מה שמסומן ״רק אני״ נשאר אצלכם בלבד,
          גם מהמשפחה.
        </p>
      </header>

      <WishBoard />
    </div>
  );
}
