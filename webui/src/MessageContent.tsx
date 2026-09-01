import React, { useState, type ReactNode } from "react";

function inline(text: string): ReactNode[] {
  // Matches links [text](url), bold **text**, italic *text*, inline code `code`
  const regex = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  const parts = text.split(regex).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("[") && part.includes("](") && part.endsWith(")")) {
      const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (match) {
        return (
          <a key={index} href={match[2]} target="_blank" rel="noopener noreferrer" style={{ color: "var(--vfd-cyan)", textDecoration: "underline" }}>
            {match[1]}
          </a>
        );
      }
    }
    return part;
  });
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span>{language ? "// " + language.toUpperCase() : "// CODE"}</span>
        <button
          onClick={copyCode}
          style={{ background: "transparent", border: "none", boxShadow: "none", color: copied ? "var(--led-green)" : "var(--text-muted)", fontSize: "11px", padding: "2px 6px", cursor: "pointer" }}
        >
          {copied ? "COPIED ✓" : "COPY"}
        </button>
      </div>
      <pre>
        <code data-language={language}>{code}</code>
      </pre>
    </div>
  );
}

export function MessageContent({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  let code: string[] = [];
  let language = "";
  let inCode = false;
  let tableRows: string[][] = [];

  const flushCode = () => {
    if (code.length) {
      nodes.push(<CodeBlock key={"code-" + nodes.length} language={language} code={code.join("\n")} />);
      code = [];
    }
  };

  const flushTable = () => {
    if (tableRows.length) {
      const header = tableRows[0];
      const rows = tableRows.slice(1).filter((r) => !r.every((c) => /^[-:| ]+$/.test(c)));
      nodes.push(
        <table key={"table-" + nodes.length} className="content-table">
          <thead>
            <tr>
              {header.map((col, i) => (
                <th key={i}>{inline(col.trim())}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.map((col, cIdx) => (
                  <td key={cIdx}>{inline(col.trim())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
      tableRows = [];
    }
  };

  lines.forEach((line, index) => {
    if (line.startsWith("```")) {
      flushTable();
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        inCode = true;
        language = line.slice(3).trim();
      }
      return;
    }

    if (inCode) {
      code.push(line);
      return;
    }

    // Markdown Tables
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const cells = line.trim().slice(1, -1).split("|");
      tableRows.push(cells);
      return;
    } else {
      flushTable();
    }

    // Headings
    if (/^#{1,4} /.test(line)) {
      const level = line.match(/^#+/)![0].length;
      const value = line.slice(level + 1);
      nodes.push(level <= 2 ? <h3 key={index}>{inline(value)}</h3> : <h4 key={index}>{inline(value)}</h4>);
      return;
    }

    // Blockquotes
    if (line.startsWith("> ")) {
      nodes.push(<blockquote key={index}>{inline(line.slice(2))}</blockquote>);
      return;
    }

    // Bullet Lists
    if (/^[-*] /.test(line)) {
      nodes.push(
        <div key={index} style={{ paddingLeft: "8px", margin: "2px 0" }}>
          <span style={{ color: "var(--amber)", marginRight: "6px" }}>•</span>
          {inline(line.slice(2))}
        </div>
      );
      return;
    }

    // Numbered Lists
    if (/^\d+\. /.test(line)) {
      const numMatch = line.match(/^(\d+)\. /);
      const num = numMatch ? numMatch[1] : "1";
      nodes.push(
        <div key={index} style={{ paddingLeft: "8px", margin: "2px 0" }}>
          <span style={{ color: "var(--amber)", marginRight: "6px", fontFamily: "var(--font-mono)", fontSize: "12px" }}>{num}.</span>
          {inline(line.slice(num.length + 2))}
        </div>
      );
      return;
    }

    // Normal Text
    nodes.push(
      <div key={index}>
        {line ? inline(line) : <br />}
      </div>
    );
  });

  flushCode();
  flushTable();

  return (
    <div className="content">
      {nodes}
      {isStreaming && <span className="streaming-caret">▍</span>}
    </div>
  );
}
