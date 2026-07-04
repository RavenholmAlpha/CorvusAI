import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RunRow, MessageRow } from "./harness/types.js";

export async function exportSessionToHtml(run: RunRow, messages: MessageRow[]): Promise<string> {
  const title = `Corvus Session: ${run.id}`;
  
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    :root {
      --bg: #0d1117;
      --text: #c9d1d9;
      --border: #30363d;
      --user-bg: #1f6feb;
      --user-text: #ffffff;
      --agent-bg: #21262d;
      --tool-bg: #161b22;
      --tool-border: #30363d;
      --code-bg: #161b22;
      --font-mono: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      margin: 0;
      padding: 0;
      line-height: 1.6;
    }
    header {
      background: #010409;
      border-bottom: 1px solid var(--border);
      padding: 1rem 2rem;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }
    header h1 { margin: 0; font-size: 1.25rem; font-weight: 600; color: #58a6ff; }
    header .status { font-size: 0.85rem; color: #8b949e; margin-top: 0.25rem; }
    .container {
      max-width: 900px;
      margin: 2rem auto;
      padding: 0 1rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .message {
      display: flex;
      flex-direction: column;
      max-width: 85%;
      animation: fadeIn 0.3s ease-out;
    }
    .message.user { align-self: flex-end; }
    .message.assistant, .message.tool, .message.system { align-self: flex-start; max-width: 95%; }
    
    .bubble {
      padding: 1rem 1.25rem;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      word-wrap: break-word;
    }
    .message.user .bubble {
      background: var(--user-bg);
      color: var(--user-text);
      border-bottom-right-radius: 4px;
    }
    .message.assistant .bubble {
      background: var(--agent-bg);
      border: 1px solid var(--border);
      border-bottom-left-radius: 4px;
    }
    .message.system .bubble {
      background: transparent;
      border: 1px dashed #79c0ff;
      color: #79c0ff;
      font-size: 0.9em;
    }
    .message.tool {
      align-self: center;
      width: 100%;
      max-width: 100%;
    }
    .message.tool .bubble {
      background: var(--tool-bg);
      border: 1px solid var(--tool-border);
      border-left: 4px solid #d2a8ff;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      overflow-x: auto;
      padding: 0.75rem 1rem;
    }
    .tool-header {
      font-weight: bold;
      color: #d2a8ff;
      margin-bottom: 0.5rem;
      display: flex;
      justify-content: space-between;
    }
    .timestamp { font-size: 0.75rem; color: #8b949e; margin-top: 0.25rem; text-align: right; }
    
    pre {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 1rem;
      overflow-x: auto;
      font-family: var(--font-mono);
      font-size: 0.85rem;
    }
    code { font-family: var(--font-mono); background: rgba(255,255,255,0.1); padding: 0.1em 0.3em; border-radius: 4px; }
    pre code { background: none; padding: 0; }
    
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body>
  <header>
    <h1>CorvusAI Session Export</h1>
    <div class="status">Run ID: ${run.id} &bull; Status: ${run.status} &bull; Created: ${new Date(run.createdAt).toLocaleString()}</div>
  </header>
  <div class="container">
`;

  for (const msg of messages) {
    const role = msg.role;
    let contentHtml = escapeHtml(msg.content ?? "");
    // Render markdown code blocks manually for simple viewing
    contentHtml = contentHtml.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
    contentHtml = contentHtml.replace(/\n/g, "<br>");

    if (role === "tool") {
      const toolName = (msg.metadata as any)?.toolName || msg.toolCallId || "unknown";
      html += `
    <div class="message tool">
      <div class="bubble">
        <div class="tool-header">
          <span>🛠️ Tool Result: ${escapeHtml(toolName)}</span>
          <span>${new Date(msg.createdAt).toLocaleTimeString()}</span>
        </div>
        <div>${contentHtml}</div>
      </div>
    </div>`;
    } else {
      let roleDisplay = "Assistant";
      if (role === "user") roleDisplay = "You";
      if (role === "system") roleDisplay = "System";

      html += `
    <div class="message ${role}">
      <div class="bubble">
        ${role === "user" ? "" : `<div style="font-weight:600; margin-bottom:0.5rem; font-size:0.85em; opacity:0.8;">${roleDisplay}</div>`}
        <div>${contentHtml}</div>
      </div>
      <div class="timestamp">${new Date(msg.createdAt).toLocaleString()}</div>
    </div>`;
    }
  }

  html += `
  </div>
</body>
</html>`;

  const cwd = process.cwd();
  const outputPath = resolve(cwd, `corvus-export-${run.id.slice(0,8)}.html`);
  await writeFile(outputPath, html, "utf8");
  return outputPath;
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
