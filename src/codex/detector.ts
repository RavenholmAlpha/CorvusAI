import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CodexDetectionResult {
  installed: boolean;
  path?: string;
  version?: string;
  error?: string;
}

let cachedDetection: { result: CodexDetectionResult; timestamp: number } | null = null;
const CACHE_TTL_MS = 60000;

async function probeVersion(executablePath: string): Promise<string | undefined> {
  const isWindows = process.platform === "win32";
  const file = isWindows ? (process.env.ComSpec || "cmd.exe") : executablePath;
  const args = isWindows ? ["/d", "/s", "/c", executablePath, "--version"] : ["--version"];
  try {
    const { stdout } = await execFileAsync(file, args, { timeout: 5000, windowsHide: true });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Detect whether the Codex CLI is installed on the user's machine.
 * Forgiving design: if codex is found on PATH or exists on disk, it is treated as available.
 */
export async function detectCodexCli(configuredPath?: string, forceFresh = false): Promise<CodexDetectionResult> {
  const now = Date.now();
  if (!forceFresh && cachedDetection && now - cachedDetection.timestamp < CACHE_TTL_MS) {
    return cachedDetection.result;
  }

  // 1. If user explicitly provided a path, verify it
  if (configuredPath) {
    if (!existsSync(configuredPath)) {
      return {
        installed: false,
        path: configuredPath,
        error: `Configured codexPath '${configuredPath}' does not exist on disk.`,
      };
    }
    const version = (await probeVersion(configuredPath)) || "codex-cli";
    const res: CodexDetectionResult = { installed: true, path: configuredPath, version };
    cachedDetection = { result: res, timestamp: now };
    return res;
  }

  // 2. Search in system PATH
  const isWindows = process.platform === "win32";
  const probeCmd = isWindows ? "where.exe" : "which";
  const probeArgs = ["codex"];

  let foundPath: string | undefined;
  try {
    const { stdout } = await execFileAsync(probeCmd, probeArgs, { timeout: 5000 });
    const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      // On Windows, prefer .cmd if present
      const preferred = lines.find((l) => l.toLowerCase().endsWith(".cmd")) || lines[0];
      foundPath = preferred;
    }
  } catch {
    // Probe failed
  }

  // 3. Fallback to common npm global paths on Windows
  if (!foundPath && isWindows && process.env.APPDATA) {
    const npmPath = `${process.env.APPDATA}\\npm\\codex.cmd`;
    if (existsSync(npmPath)) {
      foundPath = npmPath;
    }
  }

  // 4. Fallback check for command "codex"
  if (!foundPath) {
    const directVersion = await probeVersion("codex");
    if (directVersion) {
      foundPath = "codex";
    }
  }

  if (!foundPath) {
    const res: CodexDetectionResult = {
      installed: false,
      error: "Codex CLI not found in system PATH. Install via: npm install -g @openai/codex",
    };
    cachedDetection = { result: res, timestamp: now };
    return res;
  }

  // 5. Probe version (if probe fails, still return installed=true with fallback tag)
  const version = (await probeVersion(foundPath)) || "codex-cli";
  const res: CodexDetectionResult = { installed: true, path: foundPath, version };
  cachedDetection = { result: res, timestamp: now };
  return res;
}
