import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { ProviderProfile, ProviderProtocol } from "../config.js";
import { ui } from "./theme.js";

const PROTOCOLS: ProviderProtocol[] = ["openai-chat", "openai-responses", "anthropic-messages"];
const FIELDS = ["ID", "Label", "Protocol", "Endpoint", "Model", "API key", "Temperature"] as const;

export function ProviderEditor({ initial, onSave, onCancel }: { initial: ProviderProfile; onSave: (provider: ProviderProfile) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<ProviderProfile>(initial);
  const [field, setField] = useState(0);
  const value = useMemo(() => {
    if (field === 0) return draft.id;
    if (field === 1) return draft.label ?? "";
    if (field === 3) return draft.endpoint;
    if (field === 4) return draft.defaultModel ?? draft.models[0] ?? "";
    if (field === 5) return draft.apiKey;
    if (field === 6) return String(draft.temperature ?? 0.2);
    return "";
  }, [draft, field]);
  const update = (next: string) => {
    if (field === 0) setDraft({ ...draft, id: next });
    if (field === 1) setDraft({ ...draft, label: next });
    if (field === 3) setDraft({ ...draft, endpoint: next });
    if (field === 4) setDraft({ ...draft, defaultModel: next, models: next ? [next] : [] });
    if (field === 5) setDraft({ ...draft, apiKey: next });
    if (field === 6) setDraft({ ...draft, temperature: Number(next) || 0 });
  };
  const save = () => {
    const id = draft.id.trim();
    const endpoint = draft.endpoint.trim().replace(/\/+$/, "");
    const model = (draft.defaultModel ?? "").trim();
    if (!id || !endpoint.startsWith("http") || !model) return;
    onSave({ ...draft, id, endpoint, defaultModel: model, models: [model] });
  };
  useInput((input, key) => {
    if (key.escape) { onCancel(); return; }
    if (key.ctrl && input.toLowerCase() === "s") { save(); return; }
    if (key.upArrow) { setField((index) => Math.max(0, index - 1)); return; }
    if (key.downArrow || key.tab) { setField((index) => Math.min(FIELDS.length - 1, index + 1)); return; }
    if ((key.leftArrow || key.rightArrow) && field === 2) {
      const index = PROTOCOLS.indexOf(draft.protocol);
      const delta = key.leftArrow ? -1 : 1;
      setDraft({ ...draft, protocol: PROTOCOLS[(index + delta + PROTOCOLS.length) % PROTOCOLS.length] });
      return;
    }
  });
  return <Box position="absolute" top="8%" left="12%" width="76%" height="84%" borderStyle="round" borderColor={ui.accent} backgroundColor="black" padding={1} flexDirection="column">
    <Text bold color={ui.accent}>PROVIDER EDITOR</Text>
    <Text color={ui.muted}>↑↓ field · ←→ protocol · Ctrl+S save · Esc cancel</Text>
    <Box marginTop={1} flexDirection="column">
      {FIELDS.map((label, index) => <Box key={label} borderStyle={index === field ? "single" : undefined} borderColor={ui.accent} paddingX={1}>
        <Text color={index === field ? ui.accent : ui.muted}>{index === field ? "▸ " : "  "}{label}: </Text>
        {index === field && index !== 2 ? <TextInput value={value} onChange={update} onSubmit={() => setField((current) => Math.min(FIELDS.length - 1, current + 1))} /> : <Text color="white">{index === 2 ? draft.protocol : index === 5 ? (draft.apiKey ? "configured" : "not set") : index === 0 ? draft.id : index === 1 ? draft.label ?? "" : index === 3 ? draft.endpoint : index === 4 ? draft.defaultModel ?? "" : String(draft.temperature ?? 0.2)}</Text>}
      </Box>)}
    </Box>
    <Box marginTop={1}><Text color={ui.muted}>OpenAI Chat: /chat/completions · Responses: /responses · Anthropic: /messages</Text></Box>
  </Box>;
}