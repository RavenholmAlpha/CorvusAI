import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { AgentRole, ProviderProfile } from "../config.js";
import { ui } from "./theme.js";

const FIELDS = ["ID", "Label", "Provider", "Model override", "Temperature", "System prompt"] as const;

export function RoleEditor({ initial, providers, onSave, onCancel }: { initial: AgentRole; providers: ProviderProfile[]; onSave: (role: AgentRole) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<AgentRole>(initial);
  const [field, setField] = useState(0);
  const value = useMemo(() => {
    if (field === 0) return draft.id; if (field === 1) return draft.label ?? ""; if (field === 2) return draft.providerId; if (field === 3) return draft.model ?? ""; if (field === 4) return String(draft.temperature ?? 0.2); return draft.systemPrompt ?? "";
  }, [draft, field]);
  const update = (next: string) => {
    if (field === 0) setDraft({ ...draft, id: next });
    if (field === 1) setDraft({ ...draft, label: next });
    if (field === 3) setDraft({ ...draft, model: next || undefined });
    if (field === 4) setDraft({ ...draft, temperature: Number(next) || 0 });
    if (field === 5) setDraft({ ...draft, systemPrompt: next });
  };
  const save = () => { if (!draft.id.trim() || !draft.providerId) return; onSave({ ...draft, id: draft.id.trim() }); };
  useInput((input, key) => {
    if (key.escape) { onCancel(); return; }
    if (key.ctrl && input.toLowerCase() === "s") { save(); return; }
    if (key.upArrow) { setField((index) => Math.max(0, index - 1)); return; }
    if (key.downArrow || key.tab) { setField((index) => Math.min(FIELDS.length - 1, index + 1)); return; }
    if ((key.leftArrow || key.rightArrow) && field === 2 && providers.length) { const index = Math.max(0, providers.findIndex((item) => item.id === draft.providerId)); const delta = key.leftArrow ? -1 : 1; setDraft({ ...draft, providerId: providers[(index + delta + providers.length) % providers.length].id }); }
  });
  return <Box position="absolute" top="10%" left="14%" width="72%" height="80%" borderStyle="round" borderColor={ui.accent} backgroundColor="black" padding={1} flexDirection="column">
    <Text bold color={ui.accent}>AGENT ROLE EDITOR</Text>
    <Text color={ui.muted}>Roles are reusable assignments; several roles may share one provider. ↑↓ field · ←→ provider · Ctrl+S save · Esc cancel</Text>
    <Box marginTop={1} flexDirection="column">
      {FIELDS.map((label, index) => <Box key={label} borderStyle={index === field ? "single" : undefined} borderColor={ui.accent} paddingX={1}>
        <Text color={index === field ? ui.accent : ui.muted}>{index === field ? "▸ " : "  "}{label}: </Text>
        {index === field && index !== 2 ? <TextInput value={value} onChange={update} onSubmit={() => setField((current) => Math.min(FIELDS.length - 1, current + 1))} /> : <Text color="white">{index === 2 ? (providers.find((provider) => provider.id === draft.providerId)?.label || draft.providerId || "No provider") : value}</Text>}
      </Box>)}
    </Box>
  </Box>;
}