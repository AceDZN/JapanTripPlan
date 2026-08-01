"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpenText,
  CalendarDays,
  ClipboardCheck,
  Compass,
  Heart,
  House,
  MapPinned,
  MessageCircle,
  Plane,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

const primaryNav = [
  { href: "/", label: "בית", icon: House },
  { href: "/itinerary", label: "מסלול", icon: CalendarDays },
  { href: "/map", label: "מפה", icon: MapPinned },
  { href: "/around", label: "סביבי", icon: Compass },
];

const moreNav = [
  { href: "/chat", label: "צ׳אט", icon: MessageCircle, hint: "לשאול הכול על הטיול" },
  { href: "/prepare", label: "הכנות", icon: ClipboardCheck, hint: "רשימת המשימות לפני הטיסה" },
  { href: "/wishes", label: "רשימות", icon: Heart, hint: "מה כל אחד רוצה — משותף ופרטי" },
  { href: "/money", label: "כספים", icon: Wallet, hint: "מעטפות התקציב מול מה שבאמת שולם" },
  { href: "/guides", label: "מדריכים", icon: BookOpenText, hint: "כל מסמכי התכנון" },
  { href: "/private", label: "כספת", icon: ShieldCheck, hint: "כרטיסים, אישורים וקודים — רק למשפחה" },
];

const desktopNav = [...primaryNav, ...moreNav];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/itinerary") {
    return pathname.startsWith("/itinerary") || pathname.startsWith("/day");
  }
  if (href === "/guides") {
    return pathname.startsWith("/guides") || pathname.startsWith("/guide");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Fades content in on scroll, unless the visitor asked for reduced motion. */
function useScrollReveal(pathname: string) {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));

    if (reduced || typeof IntersectionObserver === "undefined") {
      return;
    }

    // Opt in to the hidden state only now that we can reveal it again.
    document.documentElement.classList.add("js");

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 },
    );

    nodes.forEach((node) => {
      if (node.getBoundingClientRect().top < window.innerHeight) {
        node.classList.add("is-visible");
      } else {
        observer.observe(node);
      }
    });

    return () => observer.disconnect();
  }, [pathname]);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Storing the route the sheet was opened from closes it on navigation
  // without an extra effect.
  const [openedFrom, setOpenedFrom] = useState<string | null>(null);
  const moreOpen = openedFrom === pathname;
  const setMoreOpen = (open: boolean) => setOpenedFrom(open ? pathname : null);

  useScrollReveal(pathname);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenedFrom(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const moreActive = moreNav.some((item) => isActive(pathname, item.href));

  return (
    <div className="shell">
      <header className="site-header">
        <Link href="/" className="brand" aria-label="יפן 2026 — לדף הבית">
          <span className="brand-mark">日</span>
          <span className="brand-text">
            <strong>יפן 2026</strong>
            <small>המסע המשפחתי שלנו</small>
          </span>
        </Link>

        <nav className="nav-desktop" aria-label="ניווט ראשי">
          {desktopNav.map(({ href, label, icon: Icon }) => (
            <Link
              className={isActive(pathname, href) ? "active" : ""}
              href={href}
              key={href}
            >
              <Icon size={17} strokeWidth={1.9} />
              {label}
            </Link>
          ))}
        </nav>

        <div className="flight-chip">
          <Plane size={14} />
          <span>TLV → NRT</span>
          <strong>1.10</strong>
        </div>
      </header>

      <main>{children}</main>

      <nav className="tabbar" aria-label="ניווט תחתון">
        {primaryNav.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              className={`tabbar-item${active ? " active" : ""}`}
              href={href}
              key={href}
            >
              <Icon size={21} strokeWidth={active ? 2.3 : 1.7} />
              <span>{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={`tabbar-item${moreActive || moreOpen ? " active" : ""}`}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen(!moreOpen)}
        >
          <Sparkles size={21} strokeWidth={moreActive || moreOpen ? 2.3 : 1.7} />
          <span>עוד</span>
        </button>
      </nav>

      {moreOpen ? (
        <div className="more-sheet" role="dialog" aria-modal="true" aria-label="תפריט נוסף">
          <button
            type="button"
            className="more-scrim"
            aria-label="סגירת התפריט"
            onClick={() => setMoreOpen(false)}
          />
          <div className="more-panel">
            <div className="more-grip" />
            <h2>עוד במסע</h2>
            <div className="more-links">
              {moreNav.map(({ href, label, icon: Icon, hint }) => (
                <Link
                  className={isActive(pathname, href) ? "active" : ""}
                  href={href}
                  key={href}
                >
                  <span className="ic">
                    <Icon size={19} strokeWidth={1.9} />
                  </span>
                  <span>
                    <strong>{label}</strong>
                    <small>{hint}</small>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {pathname === "/chat" ? null : (
        <Link href="/chat" className="chat-fab" aria-label="צ׳אט על הטיול">
          <MessageCircle size={23} strokeWidth={2} />
        </Link>
      )}
    </div>
  );
}
