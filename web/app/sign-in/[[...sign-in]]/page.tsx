import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "כניסה למשפחה",
  description: "כניסה לחלקים הפרטיים של תוכנית הטיול.",
};

/**
 * Sign-in only — there is deliberately no sign-up route.
 *
 * The four accounts are created by hand in the Clerk dashboard, so there is no
 * self-registration path from the app at all. Even if someone reached Clerk's
 * hosted sign-up directly, `requireFamily()` would refuse them everything:
 * the allowlist in convex/lib/family.ts is the real gate.
 */
export default function SignInPage() {
  return (
    <div className="container section">
      <header className="section-head">
        <p className="eyebrow">אזור משפחתי</p>
        <h1 className="display">כניסה</h1>
        <p className="lede">
          המסלול, המפה והמדריכים פתוחים לכולם בלי כניסה. הכניסה נדרשת רק
          לדברים הפרטיים — קישורי כרטיסים, אישורי הזמנה, כתובות וקודי כניסה.
        </p>
      </header>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <SignIn
          routing="path"
          path="/sign-in"
          fallbackRedirectUrl="/private"
          appearance={{
            elements: {
              // No self-registration: the four accounts are created by hand in
              // the Clerk dashboard. Clerk renders a "don't have an account?"
              // link by default, which would dead-end anyone who clicked it.
              footerAction: { display: "none" },
            },
          }}
        />
      </div>
    </div>
  );
}
