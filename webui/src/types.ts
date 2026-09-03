export interface McpServerConfig {
  name: string;
  command?: string;
  url?: string;
  args: string[];
  env: Record<string, string>;
}

export interface ProjectSummary {
  branch?: string;
  clean?: boolean;
  changedFiles?: number;
  ahead?: number;
  behind?: number;
  summary?: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  lastSessionId: string | null;
}

export interface Session {
  id: string;
  projectId: string | null;
  providerId: string | null;
  model: string | null;
  contextWindowTokens: number | null;
  name: string | null;
  preview: string | null;
  messageCount: number;
  lastActiveAt: string;
  isMaster?: boolean;
}

export interface Provider {
  id: string;
  label?: string;
  protocol: string;
  endpoint: string;
  defaultModel?: string;
  models: string[];
  temperature?: number;
  modelSettings?: Record<string, { contextWindowTokens?: number; maxOutputTokens?: number; temperature?: number }>;
}

export interface Role {
  id: string;
  label?: string;
  providerId: string;
  model?: string;
  systemPrompt?: string;
  allowedTools?: string[];
  deniedTools?: string[];
}

export interface Task {
  id: string;
  status: string;
  prompt: string;
  description?: string | null;
  modelProfile?: string | null;
  agentScope: "project" | "global";
  projectId: string | null;
  parentTaskId: string | null;
  parentRunId?: string | null;
  error?: string | null;
  createdAt?: string;
  completedAt?: string | null;
  depth: number;
  parentSessionId: string;
  childSessionId: string;
}

export interface AgentHierarchyNode {
  id: string;
  level: "master" | "project" | "subagent";
  label: string;
  status: string;
  projectId?: string | null;
  sessionId?: string | null;
  taskId?: string;
  scope?: "project" | "global";
  children: AgentHierarchyNode[];
}

export interface Approval {
  id: string;
  runId: string;
  sessionId?: string | null;
  toolCallId: string;
  toolName: string | null;
  status: string;
  toolCall?: {
    arguments?: Record<string, unknown>;
    capability?: string;
    status?: string;
  };
}

export interface Memory {
  id: string;
  projectId: string;
  kind: string;
  title: string;
  content: string;
  confidence: number;
  status: string;
}

export interface TimelineEvent {
  id: string;
  runId: string | null;
  type: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

export interface Skill {
  id: string;
  name: string;
  title: string;
  description?: string;
  triggers: string[];
  toolsRequired: string[];
  tier?: "builtin" | "global" | "workspace";
  source: string;
  isBuiltin?: boolean;
}

export interface RoleBreakdown {
  system: number;
  user: number;
  assistant: number;
  tool: number;
}

export interface ContextUsage {
  messageCount: number;
  estimatedTokens: number;
  lastRequestTokens: number;
  memoryBreakdown: RoleBreakdown;
  lastRequestBreakdown: RoleBreakdown;
  threshold: number;
  contextWindow: number;
  hasSummary: boolean;
  summaryTokens: number;
  isCompacting: boolean;
  state: "global" | "compacting" | "summarized";
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalRequests: number;
}

export interface SessionContextInfo {
  sessionId: string;
  isMaster?: boolean;
  project: { id: string; name: string; path: string } | null;
  isDispatched: boolean;
  task: Task | null;
  childTasks: Task[];
  contextUsage: ContextUsage;
  activeOperationId?: string | null;
  connection: {
    providerId: string | null;
    label: string;
    protocol: string;
    endpoint: string;
    model: string;
  };
}

export type UserRole = "admin" | "collaborator";

export interface SafeUser {
  id: string;
  username: string;
  role: UserRole;
  allowedProjectIds: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface WebState {
  currentUser?: SafeUser | null;
  activeOperations?: Record<string, string>;
  activeConnection: {
    providerId: string | null;
    label: string;
    protocol: string;
    endpoint: string;
    model: string;
  };
  plugins: any[];
  mcp: any[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    requests: number;
  };
  webLocale?: "en" | "zh-CN";
  maxToolRounds?: number;
  contextOverflowMode?: "compact-with-previous-model" | "sliding-window";
  permissionPreset?: "safe" | "balanced" | "autonomous" | "custom";
  maxConsecutiveIdenticalToolCalls?: number;
  loopProtection?: boolean;
  browser: { cdpEndpoint?: string };
  executionNodes: Record<string, any>;
  deliveries: Array<{
    id: string;
    channelId: string;
    status: string;
    attempts: number;
    lastError: string | null;
  }>;
  skills: Skill[];
  allSessions: Session[];
  masterSessions?: Session[];
  masterSessionId?: string | null;
  memoryLinks: Array<{
    memoryId: string;
    relatedMemoryId: string;
    relation: string;
  }>;
  activeProjectId?: string;
  projects: Project[];
  sessions: Session[];
  providers: Record<string, Provider>;
  roles: Record<string, Role>;
  mainProviderId?: string;
  tasks: Task[];
  approvals: Approval[];
  memories: Memory[];
  timeline: TimelineEvent[];
  artifacts: Array<{ id: string; title: string; summary: string }>;
  diagnostics: Array<{ level: string; path: string; message: string }>;
  automations: Record<string, any>;
  automationStates: Array<{
    id: string;
    lastRunAt?: string;
    nextRunAt?: string;
    lastStatus?: string;
    lastError?: string;
  }>;
  routingRules: Record<string, any>;
  channels: Record<string, any>;
}

export interface ToolCallFunction {
  name: string;
  arguments: string;
}

export interface ToolCallInfo {
  id?: string;
  type?: string;
  function: ToolCallFunction;
}

export interface SessionMessage {
  id?: string;
  runId?: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string | null;
  toolCallId?: string | null;
  metadata?: {
    name?: string;
    tool_call_id?: string;
    tool_calls?: ToolCallInfo[];
    [key: string]: any;
  } | null;
  createdAt?: string;
}
