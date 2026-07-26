import type { ReactNode } from "react";

/**
 * Markdown-lite renderer for assistant replies.
 *
 * Output is built as React elements rather than an HTML string, so model text
 * can never be interpreted as markup — no sanitiser needed. Supports the small
 * subset the concierge is told to use: bold, italics, inline code, links,
 * bullet/numbered lists, blockquotes and paragraphs.
 */

const INLINE =
  /\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>)\]]+)|\*([^*\n]+)\*|_([^_\n]+)_/g;

function safeHref(href: string): string | null {
  const trimmed = href.trim();
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith("/") ? trimmed : null;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const key = `${keyPrefix}-i${i}`;
    i += 1;

    const [, bold1, bold2, code, linkText, linkHref, autoLink, italic1, italic2] = match;

    if (bold1 ?? bold2) {
      nodes.push(<strong key={key}>{bold1 ?? bold2}</strong>);
    } else if (code) {
      nodes.push(<code key={key}>{code}</code>);
    } else if (linkText && linkHref) {
      const href = safeHref(linkHref);
      nodes.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer noopener">
            {linkText}
          </a>
        ) : (
          <span key={key}>{linkText}</span>
        ),
      );
    } else if (autoLink) {
      const href = safeHref(autoLink);
      nodes.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer noopener" dir="ltr">
            {autoLink}
          </a>
        ) : (
          <span key={key}>{autoLink}</span>
        ),
      );
    } else if (italic1 ?? italic2) {
      nodes.push(<em key={key}>{italic1 ?? italic2}</em>);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const QUOTE = /^\s*>\s?/;
const HEADING = /^\s*#{1,6}\s+/;

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];

  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];
  let key = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const content = paragraph.join("\n");
    blocks.push(
      <p key={`p${key}`}>
        {content.split("\n").map((line, index) => (
          <span key={index}>
            {index > 0 ? <br /> : null}
            {renderInline(line, `p${key}-${index}`)}
          </span>
        ))}
      </p>,
    );
    key += 1;
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    const { ordered, items } = list;
    const children = items.map((item, index) => (
      <li key={index}>{renderInline(item, `l${key}-${index}`)}</li>
    ));
    blocks.push(
      ordered ? <ol key={`l${key}`}>{children}</ol> : <ul key={`l${key}`}>{children}</ul>,
    );
    key += 1;
    list = null;
  };

  const flushQuote = () => {
    if (quote.length === 0) return;
    blocks.push(
      <blockquote key={`q${key}`}>{renderInline(quote.join(" "), `q${key}`)}</blockquote>,
    );
    key += 1;
    quote = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushAll();
      continue;
    }

    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushAll();
      blocks.push(<hr key={`h${key}`} />);
      key += 1;
      continue;
    }

    if (HEADING.test(line)) {
      flushAll();
      blocks.push(
        <p key={`t${key}`} className="chat-md-heading">
          {renderInline(line.replace(HEADING, ""), `t${key}`)}
        </p>,
      );
      key += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      flushParagraph();
      flushList();
      quote.push(line.replace(QUOTE, ""));
      continue;
    }

    if (BULLET.test(line)) {
      flushParagraph();
      flushQuote();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(line.replace(BULLET, ""));
      continue;
    }

    if (NUMBERED.test(line)) {
      flushParagraph();
      flushQuote();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(line.replace(NUMBERED, ""));
      continue;
    }

    // Continuation of a list item wraps onto the previous bullet.
    if (list) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }

    flushQuote();
    paragraph.push(line);
  }

  flushAll();
  return <div className="chat-md">{blocks}</div>;
}
