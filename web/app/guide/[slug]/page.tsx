import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Download, FileText } from "lucide-react";
import { tripGuides } from "@/app/generated/trip-content";
import { guideImage } from "@/components/guide-images";

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
    <article>
      <header className="guide-doc-hero">
        <div className="hero-media">
          <img
            src={guideImage(guide.category)}
            alt=""
            fetchPriority="high"
            width={1600}
            height={900}
          />
        </div>
        <div className="hero-wash" />
        <div className="container guide-doc-body">
          <Link className="text-link" href="/guides" style={{ color: "#fff" }}>
            <ArrowRight size={16} />
            חזרה למחברת
          </Link>
          <span className="eyebrow eyebrow-ltr" style={{ color: "#f2b134" }}>
            <FileText size={14} />
            {guide.file}
          </span>
          <h1>{guide.title}</h1>
          <p>{guide.description}</p>
          <a className="btn btn-glass btn-sm" href={`/markdown/${guide.file}`} download>
            <Download size={16} />
            הורדת קובץ המקור
          </a>
        </div>
      </header>

      <div className="doc-note">
        <strong>המסמך המקורי נשאר מקור האמת.</strong>
        <span>התוכן מופיע בשפת המקור ומתעדכן אוטומטית בכל בנייה של האתר.</span>
      </div>

      <div className="container">
        <div
          className="guide-content"
          dir="ltr"
          dangerouslySetInnerHTML={{ __html: guide.html }}
        />
      </div>
    </article>
  );
}
