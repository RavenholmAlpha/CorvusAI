import React from "react";
import { Box, Text } from "ink";
import { ui } from "./theme.js";

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <Text key={i} bold color={ui.accent}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <Text key={i} color={ui.code} backgroundColor={ui.codeBg}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
}

/**
 * Lightweight markdown renderer for assistant output: code fences (dark block),
 * headings, bold, inline code, and list bullets. Everything else stays verbatim.
 */
export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeKey = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) {
      elements.push(
        <Text key={`code-${codeKey++}`} color={ui.code} backgroundColor={ui.codeBg}>
          {line}
        </Text>,
      );
      continue;
    }
    if (line.startsWith("### ")) {
      elements.push(<Text key={i} bold>{line.slice(4)}</Text>);
    } else if (line.startsWith("## ")) {
      elements.push(<Text key={i} bold color={ui.brand}>{line.slice(3)}</Text>);
    } else if (line.startsWith("# ")) {
      elements.push(<Text key={i} bold color={ui.brand}>{line.slice(2)}</Text>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(<Text key={i}>  • {renderInline(line.slice(2))}</Text>);
    } else if (/^\d+\.\s/.test(line)) {
      elements.push(<Text key={i}>  {renderInline(line)}</Text>);
    } else if (line.trim() === "") {
      elements.push(<Text key={i}> </Text>);
    } else {
      elements.push(<Text key={i}>{renderInline(line)}</Text>);
    }
  }

  return <Box flexDirection="column">{elements}</Box>;
}