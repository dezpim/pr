import React from "react";

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  if (!content || !content.trim()) return null;

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  let inList = false;
  let listItems: React.ReactNode[] = [];

  const parseInline = (text: string): React.ReactNode[] => {
    // Basic inline formatting: **bold**, *italic*, [link](url), `code`
    const parts: React.ReactNode[] = [];
    let regex = /(\*\*.*?\*\*|\*.*?\*|\[.*?\]\(.*?\)|\`.*?\`)/g;
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        parts.push(text.substring(lastIdx, match.index));
      }
      const token = match[0];
      if (token.startsWith("**") && token.endsWith("**")) {
        parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
      } else if (token.startsWith("*") && token.endsWith("*")) {
        parts.push(<em key={match.index}>{token.slice(1, -1)}</em>);
      } else if (token.startsWith("`") && token.endsWith("`")) {
        parts.push(<code key={match.index} className="inline-code">{token.slice(1, -1)}</code>);
      } else if (token.startsWith("[") && token.includes("](")) {
        const linkText = token.substring(1, token.indexOf("]("));
        const url = token.substring(token.indexOf("](") + 2, token.length - 1);
        parts.push(
          <a
            key={match.index}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="markdown-link"
          >
            {linkText}
          </a>
        );
      }
      lastIdx = regex.lastIndex;
    }

    if (lastIdx < text.length) {
      parts.push(text.substring(lastIdx));
    }

    return parts;
  };

  const flushList = () => {
    if (inList && listItems.length > 0) {
      elements.push(<ul key={`ul-${elements.length}`} className="markdown-ul">{listItems}</ul>);
      listItems = [];
      inList = false;
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Headers
    if (trimmed.startsWith("### ")) {
      flushList();
      elements.push(<h3 key={index} className="markdown-h3">{parseInline(trimmed.slice(4))}</h3>);
    } else if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(<h2 key={index} className="markdown-h2">{parseInline(trimmed.slice(3))}</h2>);
    } else if (trimmed.startsWith("# ")) {
      flushList();
      elements.push(<h1 key={index} className="markdown-h1">{parseInline(trimmed.slice(2))}</h1>);
    } else if (trimmed.startsWith("> ")) {
      // Blockquote
      flushList();
      elements.push(
        <blockquote key={index} className="markdown-blockquote">
          {parseInline(trimmed.slice(2))}
        </blockquote>
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      // List items
      inList = true;
      listItems.push(<li key={index}>{parseInline(trimmed.slice(2))}</li>);
    } else if (trimmed === "") {
      flushList();
      elements.push(<div key={index} className="markdown-spacer" />);
    } else {
      flushList();
      elements.push(<p key={index} className="markdown-p">{parseInline(line)}</p>);
    }
  });

  flushList();

  return <div className="markdown-body">{elements}</div>;
};
