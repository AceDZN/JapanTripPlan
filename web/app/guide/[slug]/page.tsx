import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FileText } from "lucide-react";
import { getGuide, getGuides } from "@/lib/trip-source";
import { isRtl, renderGuideHtml } from "@/lib/markdown";
import { guideImage } from "@/components/guide-images";

export async function generateStaticParams() {
  const guides = await getGuides();
  return guides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getGuide(slug);
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
  const guide = await getGuide(slug);
  if (!guide) notFound();

  // Direction follows the document, not the section: the guides are being
  // translated to Hebrew one at a time, and a half-translated set needs both.
  const rtl = isRtl(guide.body);
  const html = renderGuideHtml(guide.body);

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
        </div>
      </header>

      {rtl ? null : (
        <div className="doc-note">
          <strong>המדריך הזה עדיין באנגלית.</strong>
          <span>התרגום לעברית בעבודה. התוכן המבצעי של כל יום כבר מופיע בעברית בעמודי הימים.</span>
        </div>
      )}

      <div className="container">
        <div
          className="guide-content"
          dir={rtl ? "rtl" : "ltr"}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </article>
  );
}
