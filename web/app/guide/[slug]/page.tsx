import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Download, FileText } from "lucide-react";
import { tripGuides } from "@/app/generated/trip-content";
import { guideImages } from "@/lib/trip-data";

export function generateStaticParams() {
  return tripGuides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = tripGuides.find((item) => item.slug === slug);
  return {
    title: guide?.title ?? "מדריך",
    description: guide?.description,
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = tripGuides.find((item) => item.slug === slug);
  if (!guide) notFound();

  return (
    <article className="guide-document">
      <header className="guide-hero">
        <img
          src={guideImages[guide.category]}
          alt=""
          fetchPriority="high"
        />
        <div className="guide-hero-overlay" />
        <div className="guide-hero-copy">
          <Link href="/guides">
            <ArrowRight size={17} />
            חזרה למחברת
          </Link>
          <span className="document-source">
            <FileText size={15} />
            {guide.file}
          </span>
          <h1>{guide.title}</h1>
          <p>{guide.description}</p>
          <a href={`/markdown/${guide.file}`} download>
            <Download size={17} />
            הורדת קובץ המקור
          </a>
        </div>
      </header>
      <div className="document-note">
        <strong>המסמך המקורי נשאר מקור האמת.</strong>
        <span>
          התוכן המפורט מופיע בשפת המקור ומתעדכן אוטומטית בכל בנייה של האתר.
        </span>
      </div>
      <div
        className="markdown-body"
        dir="ltr"
        dangerouslySetInnerHTML={{ __html: guide.html }}
      />
    </article>
  );
}
