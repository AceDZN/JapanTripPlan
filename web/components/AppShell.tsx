"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  CalendarDays,
  ClipboardCheck,
  House,
  MapPinned,
  Plane,
} from "lucide-react";
import type { ReactNode } from "react";

const navigation = [
  { href: "/", label: "בית", icon: House },
  { href: "/itinerary", label: "מסלול", icon: CalendarDays },
  { href: "/prepare", label: "הכנות", icon: ClipboardCheck },
  { href: "/map", label: "מפה", icon: MapPinned },
  { href: "/guides", label: "מדריכים", icon: BookOpenText },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link href="/" className="brand" aria-label="יפן 2026 — לדף הבית">
          <span className="brand-mark">日</span>
          <span>
            <strong>יפן 2026</strong>
            <small>המסע המשפחתי שלנו</small>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="ניווט ראשי">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link className={active ? "active" : ""} href={href} key={href}>
                <Icon size={17} strokeWidth={1.8} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flight-chip">
          <Plane size={15} />
          <span>TLV → NRT</span>
          <strong>1.10</strong>
        </div>
      </header>

      <main>{children}</main>

      <nav className="mobile-nav" aria-label="ניווט נייד">
        {navigation.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link className={active ? "active" : ""} href={href} key={href}>
              <Icon size={21} strokeWidth={active ? 2.4 : 1.7} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
