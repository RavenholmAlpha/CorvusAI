import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import type { RuntimeState, RuntimeStateManager, ToolActivity } from "../runtime-state.js";
import type { CorvusAgent, PendingApprovalInfo } from "../agent.js";
import type { CorvusConfig } from "../config.js";
import type { CommandRegistry, DurableHarnessAdapter } from "../commands.js";
import type { ToolRegistry } from "../tools/index.js";
import type { ChatMessage, ToolCall } from "../types.js";
import { APPROVAL_CHOICES, handleApprovalChoice } from "./approval-flow.js";
import { ui } from "./theme.js";
import { Markdown } from "./Markdown.js";
import { buildConversationRows, selectConversationRows, selectVisibleMessages } from "./stream-utils.js";

function ToolBadge({ call }: { call: ToolCall }) {
  const argStr = call.function.arguments.length > 20
    ? call.function.arguments.substring(0, 17) + "..."
    : call.function.arguments;
  return (
    <Text color={ui.brand}>
      {" [\u2699 "}{call.function.name} {argStr}{"] "}
    </Text>
  );
}

function ToolActivityItem({ activity }: { activity: ToolActivity }) {
  if (activity.status === "running") {
    return (
      <Text color={ui.accent}>
        {"\u280B \u2699\uFE0F "}{activity.toolName}{"..."}
      </Text>
    );
  }
  const seconds = activity.elapsedMs !== undefined ? (activity.elapsedMs / 1000).toFixed(1) : "?";
  if (activity.status === "failed") {
    return (
      <Text color={ui.danger}>
        {"\u2716 "}{activity.toolName}{" ("}{seconds}{"s)"}{activity.detail ? " " + activity.detail : ""}
      </Text>
    );
  }
  return (
    <Text color={ui.success}>
      {"\u2714 "}{activity.toolName}{" ("}{seconds}{"s)"}
    </Text>
  );
}

function MessageItem({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <Box paddingX={1} flexDirection="column">
        <Text color={ui.user}>{"▸ you"}</Text>
        <Box marginLeft={2}>
          <Text color="white">{msg.content}</Text>
        </Box>
      </Box>
    );
  }
  if (msg.role === "assistant") {
    return (
      <Box paddingX={1} flexDirection="column">
        <Text color={ui.assistant}>{"◂ corvus"}</Text>
        {msg.tool_calls && msg.tool_calls.length > 0 && (
          <Box marginLeft={2}>
            {msg.tool_calls.map((call, i) => (
              <ToolBadge key={call.id || i} call={call} />
            ))}
          </Box>
        )}
        <Box marginLeft={2}>
          <Markdown text={msg.content ?? ""} />
        </Box>
      </Box>
    );
  }
  if (msg.role === "tool") {
    return (
      <Box paddingX={1} marginLeft={2}>
        <Text color={ui.tool}>{"↳ "}✓ {msg.name}</Text>
      </Box>
    );
  }
  return null;
}

export interface StreamWorkbenchProps {
  state: RuntimeState;
  agent: CorvusAgent;
  config: CorvusConfig;
  commands?: CommandRegistry;
  tools?: ToolRegistry;
  harness?: DurableHarnessAdapter;
  plugins?: Array<{ name: string; version: string; status: string }>;
  saveConfig?: () => Promise<void>;
  runtimeState?: RuntimeStateManager;
  cancelRef?: React.MutableRefObject<(() => void) | null>;
}

export function StreamWorkbench({
  state,
  agent,
  config,
  commands,
  tools,
  harness,
  plugins,
  saveConfig,
  runtimeState,
  cancelRef,
}: StreamWorkbenchProps) {
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [partialMessage, setPartialMessage] = useState("");
  const [commandOutput, setCommandOutput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingUserMessages, setPendingUserMessages] = useState<string[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [version, setVersion] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [approvalFlow, setApprovalFlow] = useState<{
    runId: string;
    approvals: PendingApprovalInfo[];
    index: number;
    phase: "selecting" | "resuming";
  } | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Expose cancellation to the app-level Esc handler while processing.
  useEffect(() => {
    if (cancelRef) {
      cancelRef.current = () => abortRef.current?.abort();
    }
    return () => {
      if (cancelRef) {
        cancelRef.current = null;
      }
    };
  }, [cancelRef]);

  // Tick the elapsed timer while processing.
  useEffect(() => {
    if (!isProcessing) {
      setElapsedSec(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isProcessing]);

  const history = agent.history();

  // Keep the app-level status bar's context usage fresh.
  const syncContextUsage = () => {
    runtimeState?.update({ contextUsage: agent.contextUsage() });
  };
  useEffect(() => {
    syncContextUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Windowed rendering: only render the tail that fits, newest at the bottom.
  // (Ink 7's column-reverse overlaps rows when content exceeds the container.)
  const terminalColumns = process.stdout.columns || 120;
  const terminalRows = process.stdout.rows || 24;
  const columnWidth = Math.max(20, Math.floor(terminalColumns * 0.7) - 8);
  const separatorLine = "─".repeat(Math.max(8, Math.floor(columnWidth * 0.5)));
  const panelRows =
    (errorMessage ? 3 : 0) +
    (approvalFlow ? 7 : 0) +
    (commandOutput ? 1 + Math.min(20, commandOutput.split("\n").length) : 0) +
    (state.toolActivity.length > 0 ? 1 + Math.min(6, state.toolActivity.length) : 0);
  // Reserve headroom for labels/input; the conversation viewport itself is line-based.
  const availableRows = Math.max(2, terminalRows - 14 - panelRows);
  const windowed = selectVisibleMessages(history, availableRows, columnWidth, scrollOffset);
  const displayHistory: ChatMessage[] = [
    ...history,
    ...pendingUserMessages.map((content) => ({ role: "user" as const, content })),
    ...(isProcessing && partialMessage ? [{ role: "assistant" as const, content: partialMessage }] : []),
  ];
  const conversationRows = buildConversationRows(displayHistory, columnWidth);
  const safeLineMode = conversationRows.length > availableRows;
  // Reserve two rows for ↑/↓ navigation hints when a long response is paged.
  const lineViewport = selectConversationRows(conversationRows, Math.max(1, availableRows - 2), scrollOffset);

  // Page through actual terminal rows. This includes one long message and live output.
  useInput((_input, key) => {
    if (state.navigationOpen || state.approvalCenterOpen || !safeLineMode) return;
    const step = 3;
    if (key.pageUp) {
      setScrollOffset((current) => Math.min(current + step, Math.max(0, conversationRows.length - 1)));
    } else if (key.pageDown) {
      setScrollOffset((current) => Math.max(0, current - step));
    }
  });

  // Live data for the inspector dock (harness-backed).
  const pendingApprovalCount = harness ? harness.listPendingApprovals().length : 0;
  const evidenceCount = harness
    ? harness.listRuns().reduce((total, run) => total + harness.listEvidence(run.id).length, 0)
    : 0;
  const activeGoal = config.goal || "No active goal.";
  const recentSubagentTasks = harness?.listSubagentTasks?.(agent.activeSessionId()).slice(0, 3) ?? [];

  const handleApprovalSelect = async (choice: string) => {
    if (!approvalFlow || approvalBusy || !harness) return;
    const flow = approvalFlow;
    const approval = flow.approvals[flow.index];
    if (!approval) return;
    setApprovalBusy(true);
    try {
      await handleApprovalChoice(choice as never, approval, { harness, tools, config, saveConfig });
    } catch (e) {
      setErrorMessage((e as Error).message);
    }
    const nextIndex = flow.index + 1;
    if (nextIndex < flow.approvals.length) {
      setApprovalFlow({ ...flow, index: nextIndex });
      setApprovalBusy(false);
      return;
    }
    // All decisions made: resume the run so the model receives tool results.
    setApprovalFlow({ ...flow, phase: "resuming" });
    try {
      const resumed = await agent.resume(flow.runId);
      if (resumed.pendingApprovals && resumed.pendingApprovals.length > 0) {
        setApprovalFlow({
          runId: flow.runId,
          approvals: resumed.pendingApprovals,
          index: 0,
          phase: "selecting",
        });
      } else {
        // The final message lands in the conversation stream via history.
        setApprovalFlow(null);
      }
    } catch (e) {
      setApprovalFlow(null);
      setErrorMessage((e as Error).message);
    }
    setApprovalBusy(false);
    setVersion((v) => v + 1);
  };

  const handleSubmit = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setInputValue("");

    // Slash commands execute through the same registry as line mode.
    if (trimmed.startsWith("/") && commands) {
      try {
        const result = await commands.execute(trimmed, {
          config,
          agent,
          tools,
          harness,
          plugins,
          runtimeState,
          write: (line) => setCommandOutput((prev) => prev + line + "\n"),
          saveConfig,
        });
        if (result.exit) {
          runtimeState?.requestExit();
          runtimeState?.setMode("line");
          return;
        }
        if (result.message) {
          setCommandOutput((prev) => prev + result.message + "\n");
        }
      } catch (e) {
        setErrorMessage((e as Error).message);
      }
      return;
    }

    if (!trimmed.startsWith("/")) {
      if (isProcessing) return;
      setIsProcessing(true);
      setPartialMessage("");
      setErrorMessage("");
      // Show the user's own message immediately; history picks it up when the run lands.
      setPendingUserMessages((prev) => [...prev, trimmed]);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const result = await agent.send(trimmed, {
          onChunk: (text) => setPartialMessage((prev) => prev + text),
          signal: controller.signal,
        });
        if (result.pendingApprovals && result.pendingApprovals.length > 0 && result.runId) {
          // The user message already landed in history; drop the pending copy
          // right away so it is never shown twice during the approval flow.
          setPendingUserMessages((prev) => prev.slice(1));
          setApprovalFlow({
            runId: result.runId,
            approvals: result.pendingApprovals,
            index: 0,
            phase: "selecting",
          });
        }
      } catch (e) {
        if (controller.signal.aborted) {
          setErrorMessage("Generation cancelled.");
        } else {
          setErrorMessage((e as Error).message);
        }
      } finally {
        abortRef.current = null;
        setIsProcessing(false);
        setPartialMessage("");
        setPendingUserMessages((prev) => prev.slice(1));
        syncContextUsage();
        setVersion((v) => v + 1);
      }
    }
  };

  return (
    <Box width="100%" flexGrow={1} minHeight={0} flexDirection="row" overflow="hidden">
      <Box width="70%" minHeight={0} borderStyle="single" borderColor="gray" flexDirection="column" padding={1} overflow="hidden">
        <Box justifyContent="space-between" flexShrink={0}>
          <Text bold underline>Conversation Stream</Text>
          <Text color={ui.muted}>PgUp/PgDn · scroll 3 lines</Text>
        </Box>

        {/* Status panels: fixed at the top, hard-clipped so text can never spill past the input. */}
        <Box flexDirection="column" maxHeight="35%" flexShrink={1} overflow="hidden">
          {errorMessage && (
            <Box marginTop={1} borderStyle="single" borderColor={ui.panelBorder} paddingX={1} flexDirection="column">
              <Text bold color={ui.danger}>Error</Text>
              <Text color={ui.danger}>{errorMessage}</Text>
            </Box>
          )}
          {approvalFlow && (
            <Box marginTop={1} borderStyle="single" borderColor={ui.panelBorder} paddingX={1} flexDirection="column">
              <Text bold color={ui.accent}>Approval Required</Text>
              {approvalFlow.phase === "selecting" && !approvalBusy && approvalFlow.approvals[approvalFlow.index] ? (
                <>
                  <Text>
                    {"Run paused — tool \""}{approvalFlow.approvals[approvalFlow.index].toolName}
                    {"\" requires approval ("}{approvalFlow.index + 1}{"/"}{approvalFlow.approvals.length}{"):"}
                  </Text>
                  <Box marginTop={1}>
                    <SelectInput
                      items={APPROVAL_CHOICES.map((choice) => ({ ...choice }))}
                      onSelect={(item) => handleApprovalSelect(String(item.value))}
                    />
                  </Box>
                </>
              ) : (
                <Text dimColor>{approvalBusy ? "Processing decision..." : "Resuming run..."}</Text>
              )}
            </Box>
          )}
          {commandOutput && (
            <Box marginTop={1} borderStyle="single" borderColor={ui.panelBorder} paddingX={1} flexDirection="column">
              <Text bold color={ui.brand}>Command Output</Text>
              <Text color="white">{commandOutput.split("\n").slice(-20).join("\n")}</Text>
            </Box>
          )}
          {state.toolActivity.length > 0 && (
            <Box marginTop={1} borderStyle="single" borderColor={ui.panelBorder} paddingX={1} flexDirection="column">
              <Text bold color={ui.accent}>Tool Activity</Text>
              {state.toolActivity.slice(-6).reverse().map((activity) => (
                <ToolActivityItem key={activity.id} activity={activity} />
              ))}
            </Box>
          )}
        </Box>

        {/* Conversation stream: windowed, newest at the bottom, PageUp/PageDown scrolls. */}
        <Box flexGrow={1} minHeight={0} flexDirection="column" marginTop={1} overflow="hidden">
          {history.length === 0 && pendingUserMessages.length === 0 && !isProcessing && (
            <Box flexDirection="column" paddingX={1}>
              <Text bold color={ui.brand}>Welcome to Corvus</Text>
              <Text color={ui.muted}>Type a message to start, or use a slash command:</Text>
              <Box marginTop={1} flexDirection="column">
                <Text color={ui.muted}>  /help       list all commands</Text>
                <Text color={ui.muted}>  /status     runtime status</Text>
                <Text color={ui.muted}>  /setting    configure model / endpoint / key</Text>
                <Text color={ui.muted}>  /workspace  stream workbench</Text>
              </Box>
              <Box marginTop={1}>
                <Text color={ui.muted}>F2 Stream · F3 Dashboard · Ctrl+K Deck · Esc Line · Ctrl+C Exit</Text>
              </Box>
            </Box>
          )}
          {safeLineMode ? (
            <>
              {lineViewport.hiddenAbove > 0 && (
                <Box paddingX={1}>
                  <Text color={ui.muted}>↑ {lineViewport.hiddenAbove} earlier line(s) — PageUp</Text>
                </Box>
              )}
              {lineViewport.rows.map((row, index) => {
                if (row.role === "separator") {
                  return <Text key={`row-${index}`} color={ui.muted}>{separatorLine}</Text>;
                }
                const color = row.role === "user" ? ui.user : row.role === "assistant" ? ui.assistant : ui.tool;
                const bold = row.text.startsWith("▸") || row.text.startsWith("◂") || row.text.startsWith("↳");
                return <Box key={`row-${index}`} paddingX={1}><Text color={color} bold={bold}>{row.text || " "}</Text></Box>;
              })}
              {lineViewport.hiddenBelow > 0 && (
                <Box paddingX={1}>
                  <Text color={ui.muted}>↓ {lineViewport.hiddenBelow} newer line(s) — PageDown</Text>
                </Box>
              )}
            </>
          ) : (
            <>
              {windowed.hiddenCount > 0 && (
                <Box paddingX={1}>
                  <Text color="gray">↑ {windowed.hiddenCount} older message(s) — PageUp to view</Text>
                </Box>
              )}
              {windowed.messages.map((msg, i) => (
                <React.Fragment key={`h${i}`}>
                  {msg.role === "user" && i > 0 && (
                    <Box paddingX={1} marginTop={1}>
                      <Text color={ui.muted}>{separatorLine}</Text>
                    </Box>
                  )}
                  <MessageItem msg={msg} />
                </React.Fragment>
              ))}
              {pendingUserMessages.map((text, index) => (
                <Box key={`pending-${index}`} paddingX={1}>
                  <Text color="green">{"user> "} {text}</Text>
                </Box>
              ))}
              {isProcessing && partialMessage && (
                <Box paddingX={1} flexDirection="column">
                  <Text color="cyan">{"corvus> "} {partialMessage}</Text>
                </Box>
              )}
            </>
          )}
        </Box>

        {inputValue.startsWith("/") && commands && !isProcessing && !approvalFlow && (
          <Box paddingX={1}>
            <Text color={ui.muted}>
              {(() => {
                const query = inputValue.slice(1).toLowerCase();
                const matches = commands.list().filter((c) => c.name.startsWith(query)).slice(0, 8);
                return matches.length > 0
                  ? matches.map((c) => "/" + c.name + "  " + c.summary).join("  │  ")
                  : "no matching command — type /help for all commands";
              })()}
            </Text>
          </Box>
        )}
        <Box borderStyle="single" borderColor={state.inputMode === "compose" && !isProcessing ? "green" : "gray"} paddingX={1} flexShrink={0}>
          <Text color={state.inputMode === "compose" && !isProcessing ? "green" : "gray"}>▶ </Text>
          {isProcessing ? (
            <Text dimColor>Streaming response... ({elapsedSec}s) · Esc NAV · Ctrl+C exit</Text>
          ) : approvalFlow ? (
            <Text dimColor>Approval pending — press a for Approval Center.</Text>
          ) : state.inputMode === "compose" ? (
            <TextInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSubmit}
              placeholder="Type a message or slash command..."
            />
          ) : (
            <Text color={ui.muted}>Navigation mode · press i to compose · Esc opens menu</Text>
          )}
        </Box>
      </Box>

      <Box width="30%" minHeight={0} borderStyle="single" borderColor="gray" flexDirection="column" padding={1} overflow="hidden">
        <Text bold underline>Inspector Dock</Text>
        <Box marginTop={1} flexDirection="column">
          <Text bold color={ui.brand}>Goal</Text>
          <Text dimColor>{activeGoal}</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text bold color={ui.accent}>Approval Queue</Text>
          <Text color={pendingApprovalCount > 0 ? "yellow" : "gray"}>
            {pendingApprovalCount > 0
              ? `${pendingApprovalCount} pending item(s) — /approvals to review`
              : "0 pending items"}
          </Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text bold color={ui.brand}>Evidence</Text>
          <Text dimColor>{evidenceCount} stored item(s)</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text bold color={ui.accent}>Sub-agent Tasks</Text>
          {recentSubagentTasks.length === 0 ? (
            <Text dimColor>None yet — delegated task() calls appear here.</Text>
          ) : (
            recentSubagentTasks.map((task) => {
              const color = task.status === "succeeded" ? ui.success : task.status === "failed" ? ui.danger : ui.accent;
              const label = task.description || task.prompt.slice(0, 34);
              return <Text key={task.id} color={color}>[{task.status}] d{task.depth} {label}</Text>;
            })
          )}
          <Text dimColor>/tasks for full history</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text bold color={ui.muted}>Checklist</Text>
          <Text dimColor>[ ] Review tool results before final answers</Text>
        </Box>
        <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
          <Text bold color={ui.brand}>Context Manager</Text>
          {(() => {
            const usage = agent.contextUsage();
            // The meter tracks real model-window pressure (last request incl. tool
            // results vs the configured context window), not the memory-only view.
            const windowRatio = usage.contextWindow > 0 ? usage.lastRequestTokens / usage.contextWindow : 0;
            const filled = Math.max(0, Math.min(14, Math.round(windowRatio * 14)));
            const meter = "█".repeat(filled) + "░".repeat(14 - filled);
            const windowPct = Math.round(windowRatio * 100);
            const meterColor = windowRatio > 0.9 ? "red" : windowRatio > 0.7 ? "yellow" : "gray";
            const stateColor = usage.state === "compacting" ? "yellow" : usage.state === "summarized" ? "green" : "gray";
            const stateLabel = usage.state.toUpperCase();
            const total = usage.lastRequestTokens;
            const memoryTotal = usage.estimatedTokens;
            return (
              <>
                <Text color={stateColor}>State: {stateLabel}{usage.isCompacting ? " (async summary in flight)" : ""}</Text>
<Text color={meterColor}>{meter} {`${(usage.lastRequestTokens / 1000).toFixed(1)}K/${(usage.contextWindow / 1000).toFixed(0)}K window (${windowPct}%) — last request`}</Text>
                <Text color={total > usage.threshold * 0.7 ? "yellow" : "gray"}>
                  {`last request: ${(total / 1000).toFixed(1)}K tokens total`}
                </Text>
                {([
                  { key: "system", label: "system prompt", color: "gray" as const },
                  { key: "user", label: "user messages", color: "green" as const },
                  { key: "assistant", label: "assistant replies", color: "blue" as const },
                  { key: "tool", label: "tool results", color: "magenta" as const },
                ] as const).map(({ key, label, color }) => {
                  const tokens = usage.lastRequestBreakdown[key];
                  const pct = total > 0 ? Math.round((tokens / total) * 100) : 0;
                  const bar = tokens > 0 ? (pct >= 30 ? "███" : pct >= 10 ? "██" : "█") : "░";
                  return (
                    <Text key={key} color={color}>
                      {`   ${bar} ${label.padEnd(16)} ${(tokens / 1000).toFixed(1).padStart(6)}K (${String(pct).padStart(3)}%)`}
                    </Text>
                  );
                })}
<Text dimColor>{`memory ${(memoryTotal / 1000).toFixed(1)}K/${(usage.threshold / 1000).toFixed(0)}K (compaction budget) · ${usage.messageCount} msgs (${windowed.messages.length} shown, ${windowed.hiddenCount} hidden, k=4)`}</Text>
                <Text dimColor>{`window ${(usage.contextWindow / 1000).toFixed(0)}K tokens · compaction at ${((usage.threshold / usage.contextWindow) * 100).toFixed(0)}%`}</Text>
                <Text dimColor>{`usage: ${usage.totalRequests} requests · ${(usage.totalPromptTokens / 1000).toFixed(1)}K prompt + ${(usage.totalCompletionTokens / 1000).toFixed(1)}K completion`}</Text>
                <Text dimColor>
                  {usage.hasSummary
                    ? `summary ~${(usage.summaryTokens / 1000).toFixed(1)}K tokens`
                    : "summary: none (full history retained)"}
                </Text>
                {usage.compactionHistory.length > 0 && (
                  <Box marginTop={1} flexDirection="column">
                    <Text dimColor>Compactions:</Text>
                    {usage.compactionHistory.slice(-4).map((record, i) => (
                      <Text key={i} dimColor>
                        {`  ${record.at} · ${record.compactedCount} msgs → ~${(record.summaryTokens / 1000).toFixed(1)}K tokens`}
                      </Text>
                    ))}
                  </Box>
                )}
              </>
            );
          })()}
        </Box>
      </Box>
    </Box>
  );
}