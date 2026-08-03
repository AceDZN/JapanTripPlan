import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Heebo, Noto_Serif_Hebrew } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { heIL } from "@clerk/localizations";
import { AppShell } from "@/components/AppShell";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { ServiceWorkerRegistrar } from "@/components/chat/ServiceWorkerRegistrar";
import { themeBootScript, themeBootStyle } from "@/lib/theme";
import "./globals.css";
import "leaflet/dist/leaflet.css";

/**
 * Fonts are downloaded at build time and served from our own origin
 * (no runtime CDN request), so the app stays fast and offline-friendly.
 */
const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

const notoSerif = Noto_Serif_Hebrew({
  variable: "--font-noto-serif",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

/**
 * No `themeColor` here on purpose: a manual light/dark choice has to win over
 * the OS setting, and media-scoped <meta> tags can't express that. The theme
 * boot script appends the single correct theme-color tag instead.
 */
export const viewport: Viewport = {
  colorScheme: "light dark",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const metadataBase = new URL(host ? `${protocol}://${host}` : "http://localhost:3000");
  const socialImage = new URL("/og.png", metadataBase).toString();

  return {
    metadataBase,
    title: {
      default: "יפן 2026 — המסע המשפחתי שלנו",
      template: "%s | יפן 2026",
    },
    description:
      "תוכנית המשפחה ליפן 2026: אנימה, גיימינג, פוקימון, נינטנדו, ראמן וקוואי במסלול מדויק של 17 ימים.",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "יפן 2026", statusBarStyle: "default" },
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
      apple: "/icons/apple-touch-icon.png",
    },
    openGraph: {
      title: "יפן 2026 — המסע המשפחתי שלנו",
      description: "17 ימים של אנימה, גיימינג, פוקימון, נינטנדו, ראמן וקוואי.",
      images: [{ url: socialImage, width: 1730, height: 909 }],
      locale: "he_IL",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "יפן 2026 — המסע המשפחתי שלנו",
      description: "17 ימים של אנימה, גיימינג, פוקימון, נינטנדו, ראמן וקוואי.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider localization={heIL} afterSignOutUrl="/">
      <ConvexClientProvider>
        {/* suppressHydrationWarning: the boot script below stamps data-theme
            on <html> before React hydrates, so the served markup and the live
            DOM differ by design. */}
        <html lang="he" dir="rtl" suppressHydrationWarning>
          <head>
            <style dangerouslySetInnerHTML={{ __html: themeBootStyle }} />
            <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
          </head>
          <body className={`${heebo.variable} ${notoSerif.variable}`}>
            <AppShell>{children}</AppShell>
            <ServiceWorkerRegistrar />
          </body>
        </html>
      </ConvexClientProvider>
    </ClerkProvider>
  );
}
