import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { RuntimeState } from "../runtime-state.js";
import type { CorvusAgent } from "../agent.js";
import type { ChatMessage, ToolCall } from "../types.js";

function ToolBadge({ call }: { call: ToolCall }) {
  // Simple badge: [ tool_name (args...) ]
  const argStr = call.function.arguments.length > 20
    ? call.function.arguments.substring(0, 17) + "..."
    : call.function.arguments;
  return (
    <Text color="cyan">
      {" ["}⚙ {call.function.name} {argStr}{"] "}
    </Text>
  );
}

function MessageItem({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <Box paddingX={1}>
        <Text color="green">{"user> "} {msg.content}</Text>
      </Box>
    );
  }
  if (msg.role === "assistant") {
    return (
      <Box paddingX={1} flexDirection="column">
        <Text color="blue">{"corvus> "} {msg.content}</Text>
        {msg.tool_calls && msg.tool_calls.length > 0 && (
          <Box marginLeft={2}>
            {msg.tool_calls.map((call, i) => (
              <ToolBadge key={call.id || i} call={call} />
            ))}
          </Box>
        )}
      </Box>
    );
  }
  if (msg.role === "tool") {
    return (
      <Box paddingX={1} marginLeft={2}>
        <Text color="gray">{"↳ "}✓ Tool result: {msg.name}</Text>
      </Box>
    );
  }
  return null;
}

export function StreamWorkbench({ state, agent }: { state: RuntimeState; agent: CorvusAgent }) {
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [version, setVersion] = useState(0);

  const history = agent.history();

  const handleSubmit = async (query: string) => {
    if (!query.trim() || isProcessing) return;
    setInputValue("");
    setIsProcessing(true);
    try {
      await agent.send(query);
    } catch (e) {
      // Ignore
    } finally {
      setIsProcessing(false);
      setVersion((v) => v + 1);
    }
  };

  return (
    <Box width="100%" height="100%" flexDirection="row">
      <Box width="70%" borderStyle="single" borderColor="gray" flexDirection="column" padding={1}>
        <Text bold underline>Conversation Stream</Text>
        <Box flexGrow={1} flexDirection="column" marginTop={1}>
          {history.map((msg, i) => <MessageItem key={i} msg={msg} />)}
        </Box>
        <Box borderStyle="single" borderColor={isProcessing ? "gray" : "green"} paddingX={1}>
          <Text color={isProcessing ? "gray" : "green"}>▶ </Text>
          {isProcessing ? (
            <Text dimColor>Processing...</Text>
          ) : (
            <TextInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSubmit}
              placeholder="Type a message or slash command..."
            />
          )}
        </Box>
      </Box>

      <Box width="30%" borderStyle="single" borderColor="gray" flexDirection="column" padding={1}>
        <Text bold underline>Inspector Dock</Text>
        <Box marginTop={1} flexDirection="column">
          <Text bold color="white">Goal</Text>
          <Text dimColor>No active goal.</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text bold color="yellow">Approval Queue</Text>
          <Text dimColor>{state.approvalQueue?.length || 0} pending items</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text bold color="cyan">Evidence</Text>
          <Text dimColor>{state.evidenceItems?.length || 0} stored items</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text bold color="magenta">Checklist</Text>
          <Text dimColor>[ ] Check constraints</Text>
        </Box>
      </Box>
    </Box>
  );
}
