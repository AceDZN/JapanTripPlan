import type { Metadata } from "next";
import { headers } from "next/headers";
import { Heebo, Noto_Serif_Hebrew } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";
import "leaflet/dist/leaflet.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

const notoSerif = Noto_Serif_Hebrew({
  variable: "--font-noto-serif",
  subsets: ["hebrew", "latin"],
});

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
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
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
    <html lang="he" dir="rtl">
      <body className={`${heebo.variable} ${notoSerif.variable}`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
