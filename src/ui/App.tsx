import React, { useEffect, useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { RuntimeStateManager, RuntimeState } from "../runtime-state.js";
import { StreamWorkbench } from "./StreamWorkbench.js";
import { ControlDashboard } from "./ControlDashboard.js";
import { SetupWizard } from "./SetupWizard.js";
import { CommandDeck } from "./CommandDeck.js";
import type { CorvusAgent } from "../agent.js";
import type { CorvusConfig } from "../config.js";

export interface AppProps {
  stateManager: RuntimeStateManager;
  agent: CorvusAgent;
  config: CorvusConfig;
}

export function App({ stateManager, agent, config }: AppProps) {
  const [state, setState] = useState<RuntimeState>(stateManager.get());
  const { exit } = useApp();

  useEffect(() => {
    const handleChange = (newState: RuntimeState) => {
      setState(newState);
      if (newState.mode === "line") {
        exit();
      }
    };
    stateManager.on("change", handleChange);
    return () => {
      stateManager.off("change", handleChange);
    };
  }, [stateManager, exit]);

  useInput((input, key) => {
    if (key.escape) {
      if (state.commandDeckOpen) {
        stateManager.toggleCommandDeck();
      }
    } else if (key.ctrl && input === "k") {
      stateManager.toggleCommandDeck();
    } else if (input === "q" && !state.commandDeckOpen) {
      stateManager.setMode("line");
    } else if (input === "\u001bOP" || input === "\x1b[11~") {
      // F1
    } else if (input === "\u001bOQ" || input === "\x1b[12~") {
      // F2 Stream
      stateManager.setMode("stream");
    } else if (input === "\u001bOR" || input === "\x1b[13~") {
      // F3 Dashboard
      stateManager.setMode("dashboard");
    } else if (input === "\u001bOS" || input === "\x1b[14~") {
      // F4 Settings
      stateManager.setMode("dashboard");
      stateManager.setDashboardSection("settings");
    } else if (input === "\x1b[15~") {
      // F5 Tools
      stateManager.setMode("dashboard");
      stateManager.setDashboardSection("tools");
    }
  });

  return (
    <Box flexDirection="column" width="100%" height={process.stdout.rows || 24}>
      {/* Top Status Bar shared across all workbench modes */}
      <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">
          CORVUS <Text color="white">Workbench</Text>
        </Text>
        <Text color="gray">
          Mode: {state.mode.toUpperCase()} | {config.model}
        </Text>
        <Text color="yellow">F2:Stream F3:Dash Ctrl+K:Deck Q:Exit</Text>
      </Box>

      {/* Main Content Area */}
      <Box flexGrow={1} flexDirection="row">
        {state.mode === "stream" && <StreamWorkbench state={state} agent={agent} />}
        {state.mode === "dashboard" && <ControlDashboard state={state} manager={stateManager} />}
        {state.mode === "setup" && <SetupWizard state={state} manager={stateManager} config={config} />}
      </Box>

      {/* Command Deck Overlay */}
      {state.commandDeckOpen && (
        <Box
          position="absolute"
          top="10%"
          left="20%"
          width="60%"
          height="80%"
          borderStyle="round"
          borderColor="blue"
          backgroundColor="black"
        >
          <CommandDeck state={state} manager={stateManager} />
        </Box>
      )}
    </Box>
  );
}
