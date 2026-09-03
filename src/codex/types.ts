export interface CodexUsage {
  input_tokens: number;
  cached_input_tokens?: number;
  cache_write_input_tokens?: number;
  output_tokens: number;
  reasoning_output_tokens?: number;
}

export type CommandExecutionStatus = "in_progress" | "completed" | "failed";

export interface CommandExecutionItem {
  id: string;
  type: "command_execution";
  command: string;
  aggregated_output: string;
  exit_code?: number;
  status: CommandExecutionStatus;
}

export interface FileUpdateChange {
  path: string;
  kind: "add" | "delete" | "update";
}

export interface FileChangeItem {
  id: string;
  type: "file_change";
  changes: FileUpdateChange[];
  status: "completed" | "failed";
}

export interface McpToolCallItem {
  id: string;
  type: "mcp_tool_call";
  server: string;
  tool: string;
  arguments: unknown;
  result?: unknown;
  error?: { message: string };
  status: "in_progress" | "completed" | "failed";
}

export interface AgentMessageItem {
  id: string;
  type: "agent_message";
  text: string;
}

export interface ReasoningItem {
  id: string;
  type: "reasoning";
  text: string;
}

export interface WebSearchItem {
  id: string;
  type: "web_search";
  query: string;
}

export interface TodoItem {
  text: string;
  completed: boolean;
}

export interface TodoListItem {
  id: string;
  type: "todo_list";
  items: TodoItem[];
}

export interface ErrorItem {
  id: string;
  type: "error";
  message: string;
}

export type CodexThreadItem =
  | CommandExecutionItem
  | FileChangeItem
  | McpToolCallItem
  | AgentMessageItem
  | ReasoningItem
  | WebSearchItem
  | TodoListItem
  | ErrorItem;

export type CodexEvent =
  | { type: "thread.started"; thread_id: string }
  | { type: "turn.started" }
  | { type: "turn.completed"; usage: CodexUsage }
  | { type: "turn.failed"; error: { message: string } }
  | { type: "item.started"; item: CodexThreadItem }
  | { type: "item.updated"; item: CodexThreadItem }
  | { type: "item.completed"; item: CodexThreadItem }
  | { type: "error"; message: string };

export interface CodexCallbacks {
  onThreadStarted?: (threadId: string) => void;
  onChunk?: (text: string) => void;
  onReasoningChunk?: (thought: string) => void;
  onItemStarted?: (item: CodexThreadItem) => void;
  onItemUpdated?: (item: CodexThreadItem) => void;
  onItemCompleted?: (item: CodexThreadItem) => void;
  onError?: (error: string) => void;
}

export interface CodexRunOptions {
  prompt: string;
  workingDirectory: string;
  threadId?: string;
  model?: string;
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  signal?: AbortSignal;
  timeoutMs?: number;
  codexPath?: string;
}

export interface CodexRunResult {
  ok: boolean;
  threadId?: string;
  finalResponse: string;
  reasoning: string;
  commands: CommandExecutionItem[];
  fileChanges: FileChangeItem[];
  mcpCalls: McpToolCallItem[];
  usage?: CodexUsage;
  error?: string;
}
