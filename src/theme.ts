export const colors = {
  reset: "\u001b[0m",
  blackBg: "\u001b[40m",
  orange: "\u001b[38;5;208m",
  gray: "\u001b[90m",
  white: "\u001b[97m",
  dim: "\u001b[2m",
  bold: "\u001b[1m",
};

export function cassetteHeader(): string {
  return [
    `${colors.blackBg}${colors.orange}${colors.bold} CORVUS ${colors.reset}${colors.gray} // AI AGENT HARNESS // C-90 CONTROL DECK${colors.reset}`,
    `${colors.gray}+--------------------------------------------------------------+${colors.reset}`,
    `${colors.gray}|${colors.reset} ${colors.white}[PLAY]${colors.reset} ${colors.orange}[REC]${colors.reset} ${colors.gray}[PAUSE]${colors.reset}  O====O  PERMISSIONED TOOLS  OPENAI-COMPAT API ${colors.gray}|${colors.reset}`,
    `${colors.gray}+--------------------------------------------------------------+${colors.reset}`,
  ].join("\n");
}

export function promptLabel(): string {
  return `${colors.orange}corvus>${colors.reset} `;
}

export function assistantLabel(): string {
  return `${colors.white}corvus${colors.gray}/${colors.orange}assistant${colors.reset}`;
}

export function systemLine(message: string): string {
  return `${colors.gray}${message}${colors.reset}`;
}

export function errorLine(message: string): string {
  return `${colors.orange}error:${colors.reset} ${message}`;
}

