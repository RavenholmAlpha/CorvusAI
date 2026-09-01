import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider, useI18n, type Locale } from "../i18n";
import "./ProjectsPage";
import "./AgentsPage";
import "./TasksPage";
import "./ApprovalsPage";
import "./ChatPage";

function Translation({ id, params }: { id: string; params?: Record<string, string | number> }) {
  const { t } = useI18n();
  return <span>{t(id, params)}</span>;
}

function expectTranslation(locale: Locale, id: string, expected: string, params?: Record<string, string | number>) {
  render(<I18nProvider initialLocale={locale}><Translation id={id} params={params} /></I18nProvider>);
  expect(screen.getByText(expected)).toBeTruthy();
}

describe("page localization dictionaries", () => {
  it("provides authored English and Simplified Chinese project strings with dynamic data", () => {
    expectTranslation("en", "projects.dispatchTitle", "Dispatch to Corvus Project Agent", { name: "Corvus" });
    expectTranslation("zh-CN", "projects.dispatchTitle", "派发给 Corvus 项目智能体", { name: "Corvus" });
  });

  it("provides authored strings for agents, tasks, and approvals", () => {
    expectTranslation("zh-CN", "agents.loading", "正在加载智能体层级…");
    expectTranslation("zh-CN", "tasks.cancelFailed", "取消任务失败：E42", { error: "E42" });
    expectTranslation("zh-CN", "approvals.required", "需要授权");
    expectTranslation("en", "approvals.arguments", "PROPOSED ARGUMENTS:");
  });

  it("provides authored chat strings in both locales", () => {
    expectTranslation("en", "chat.send", "SEND ↵");
    expectTranslation("zh-CN", "chat.send", "发送 ↵");
  });
});
