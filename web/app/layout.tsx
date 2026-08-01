import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Heebo, Noto_Serif_Hebrew } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { AppShell } from "@/components/AppShell";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { ServiceWorkerRegistrar } from "@/components/chat/ServiceWorkerRegistrar";
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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1120" },
  ],
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
    <ClerkProvider>
      <ConvexClientProvider>
        <html lang="he" dir="rtl">
          <body className={`${heebo.variable} ${notoSerif.variable}`}>
            <AppShell>{children}</AppShell>
            <ServiceWorkerRegistrar />
          </body>
        </html>
      </ConvexClientProvider>
    </ClerkProvider>
  );
}
