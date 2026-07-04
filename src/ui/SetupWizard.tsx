import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import type { RuntimeState, RuntimeStateManager } from "../runtime-state.js";
import type { CorvusConfig } from "../config.js";

type SetupStep = "endpoint" | "model" | "apikey" | "preset" | "plugins" | "review";

export function SetupWizard({ state, manager, config }: { state: RuntimeState; manager: RuntimeStateManager; config: CorvusConfig }) {
  const [step, setStep] = useState<SetupStep>("endpoint");
  const [endpoint, setEndpoint] = useState(config.endpoint || "https://api.openai.com/v1");
  const [model, setModel] = useState(config.model || "gpt-4o");
  const [apiKeyEnv, setApiKeyEnv] = useState(config.apiKeyEnv || "OPENAI_API_KEY");

  const finishSetup = () => {
    // In a full implementation, this would call saveConfig()
    // and update the real config object.
    config.endpoint = endpoint;
    config.model = model;
    config.apiKeyEnv = apiKeyEnv;
    manager.setMode("stream"); // Enter workspace when done
  };

  return (
    <Box width="100%" height="100%" borderStyle="single" borderColor="blue" flexDirection="column" padding={2}>
      <Text bold color="cyan" underline>Corvus Setup Wizard</Text>

      {step === "endpoint" && (
        <Box marginTop={2} flexDirection="column">
          <Text>Step 1: Provider & Endpoint</Text>
          <Box marginTop={1}>
            <Text>Endpoint: </Text>
            <TextInput value={endpoint} onChange={setEndpoint} onSubmit={() => setStep("model")} />
          </Box>
        </Box>
      )}

      {step === "model" && (
        <Box marginTop={2} flexDirection="column">
          <Text>Step 2: Model Selection</Text>
          <Box marginTop={1}>
            <Text>Model: </Text>
            <TextInput value={model} onChange={setModel} onSubmit={() => setStep("apikey")} />
          </Box>
        </Box>
      )}

      {step === "apikey" && (
        <Box marginTop={2} flexDirection="column">
          <Text>Step 3: API Key Environment Variable</Text>
          <Box marginTop={1}>
            <Text>Env Var: </Text>
            <TextInput value={apiKeyEnv} onChange={setApiKeyEnv} onSubmit={() => setStep("preset")} />
          </Box>
        </Box>
      )}

      {step === "preset" && (
        <Box marginTop={2} flexDirection="column">
          <Text>Step 4: Permission Preset</Text>
          <SelectInput
            items={[
              { label: "Safe (Ask for everything)", value: "safe" },
              { label: "Balanced (Ask for writes/shell)", value: "balanced" },
              { label: "Autonomous (Allow all)", value: "autonomous" },
            ]}
            onSelect={() => setStep("plugins")}
          />
        </Box>
      )}

      {step === "plugins" && (
        <Box marginTop={2} flexDirection="column">
          <Text>Step 5: Plugins</Text>
          <Text dimColor>Loaded 0 plugins from {config.pluginDir}</Text>
          <Box marginTop={1}>
            <SelectInput
              items={[{ label: "Continue", value: "next" }]}
              onSelect={() => setStep("review")}
            />
          </Box>
        </Box>
      )}

      {step === "review" && (
        <Box marginTop={2} flexDirection="column">
          <Text>Step 6: Review Mode Settings</Text>
          <SelectInput
            items={[
              { label: "Enable strict review checklist", value: "yes" },
              { label: "Disable review mode", value: "no" },
            ]}
            onSelect={finishSetup}
          />
        </Box>
      )}

      <Box marginTop={2}>
        <Text color="yellow">Press Esc to exit setup and enter Line Mode.</Text>
      </Box>
    </Box>
  );
}
