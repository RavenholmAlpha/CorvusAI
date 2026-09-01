import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import type { RuntimeState, RuntimeStateManager } from "../runtime-state.js";

const DECK_ACTIONS = [
  { label: "Stream Workbench (F2)", value: "stream" },
  { label: "Control Dashboard (F3)", value: "dashboard" },
  { label: "Setup Center", value: "setup" },
  { label: "Return to Line Mode (Esc)", value: "line" },
];

export function CommandDeck({ state, manager }: { state: RuntimeState; manager: RuntimeStateManager }) {
  const handleSelect = (item: { value: string }) => {
    manager.toggleCommandDeck();
    if (item.value === "line") {
      manager.setMode("line");
    } else if (item.value === "stream") {
      manager.setMode("stream");
    } else if (item.value === "dashboard") {
      manager.setMode("dashboard");
    } else if (item.value === "setup") {
      manager.setMode("dashboard");
      manager.setDashboardSection("setup");
    }
  };

  return (
    <Box width="100%" height="100%" flexDirection="column" padding={2}>
      <Text bold color="cyan" underline>Command Deck</Text>
      <Box marginTop={1} flexDirection="column">
        <SelectInput items={DECK_ACTIONS} onSelect={handleSelect} />
      </Box>
      <Box marginTop={2}>
        <Text color="yellow">Press Esc or Ctrl+K to close.</Text>
      </Box>
    </Box>
  );
}
