import React, { useEffect, useState } from "react";
import { getJson, postJson } from "../api";
import { Card, toast } from "../components";
import { defineTranslations, useI18n } from "../i18n";

interface Bundle {
  id: "minimal" | "default" | "full";
  label: string;
  description: string;
  features: string[];
}

interface Plugin {
  id: string;
  manifest?: {
    name: string;
    version: string;
    description?: string;
  };
  enabled: boolean;
  configured: boolean;
  health: string;
  grantedCapabilities: string[];
  missingCapabilities: string[];
  error?: string;
}

defineTranslations({
  "installation.appliedRestart": {
    en: "Preset applied. Restart Corvus to activate every component.",
    "zh-CN": "预设已应用。请重启 Corvus 以激活所有组件。",
  },
  "installation.applied": {
    en: "Preset applied.",
    "zh-CN": "预设已应用。",
  },
  "installation.title": {
    en: "Installation Profile",
    "zh-CN": "安装配置",
  },
  "installation.current": {
    en: "Current bundle: {bundle}",
    "zh-CN": "当前功能包：{bundle}",
  },
  "installation.currentBadge": {
    en: "CURRENT",
    "zh-CN": "当前激活",
  },
  "installation.note": {
    en: "Feature bundles and permission presets are independent. Applying Full never auto-approves tools.",
    "zh-CN": "功能包与权限预设相互独立。应用“完整”配置绝不会自动批准工具。",
  },
  "installation.preview": {
    en: "Preview Plan",
    "zh-CN": "预览方案",
  },
  "installation.custom": {
    en: "Custom Capability Set",
    "zh-CN": "自定义能力集",
  },
  "installation.previewCustom": {
    en: "Preview Custom Plan",
    "zh-CN": "预览自定义方案",
  },
  "installation.plan": {
    en: "Plan: revision {revision} → {preset}",
    "zh-CN": "计划：修订版 {revision} → {preset}",
  },
  "installation.add": {
    en: "Add features: {features}",
    "zh-CN": "添加功能：{features}",
  },
  "installation.remove": {
    en: "Remove features: {features}",
    "zh-CN": "移除功能：{features}",
  },
  "installation.review": {
    en: "New capabilities requiring review: {capabilities}",
    "zh-CN": "需要审查的新能力：{capabilities}",
  },
  "installation.none": {
    en: "None",
    "zh-CN": "无",
  },
  "installation.apply": {
    en: "Apply Preset & Upgrade",
    "zh-CN": "应用预设并更新",
  },
  "installation.plugins": {
    en: "Dynamic Plugins",
    "zh-CN": "动态插件",
  },
  "installation.states": {
    en: "Installed, enabled, configured and authorized are separate states.",
    "zh-CN": "已安装、已启用、已配置和已授权是彼此独立的状态。",
  },
  "installation.health": {
    en: "Health: {health} · grants: {grants}",
    "zh-CN": "健康状态：{health} · 已授权：{grants}",
  },
  "installation.noGrants": {
    en: "none",
    "zh-CN": "无",
  },
  "installation.missing": {
    en: " · missing: {items}",
    "zh-CN": " · 缺少：{items}",
  },
  "installation.disable": {
    en: "Disable",
    "zh-CN": "禁用",
  },
  "installation.enable": {
    en: "Enable",
    "zh-CN": "启用",
  },
  "installation.noPlugins": {
    en: "No user plugins installed. Bundled capabilities remain available through the selected profile.",
    "zh-CN": "未安装用户插件。所选配置中的内置能力仍然可用。",
  },
});

export function InstallationPage() {
  const [catalog, setCatalog] = useState<Bundle[]>([]);
  const [current, setCurrent] = useState<any>();
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [plan, setPlan] = useState<any>();
  const [message, setMessage] = useState("");
  const [custom, setCustom] = useState<string[]>([]);
  const { t } = useI18n();

  const reload = async () => {
    try {
      const [c, s, p] = await Promise.all([
        getJson<any>("/api/v1/bundles/catalog"),
        getJson<any>("/api/v1/bundles/current"),
        getJson<Plugin[]>("/api/v1/plugins"),
      ]);
      setCatalog(c.presets || []);
      setCurrent(s);
      setPlugins(p || []);
    } catch (err) {
      toast.error(`Failed to load installation config: ${String(err)}`);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const preview = async (id: string) => {
    try {
      const result = await postJson("/api/v1/bundles/plan", {
        preset: id,
        ...(id === "custom" ? { components: custom } : {}),
      });
      setPlan(result);
      toast.info(`Plan generated for preset '${id}'`);
    } catch (err) {
      toast.error(`Failed to plan bundle: ${String(err)}`);
    }
  };

  const features = [...new Set(catalog.flatMap((i) => i.features))].sort();

  const apply = async () => {
    if (!plan) return;
    try {
      const r = await postJson<any>("/api/v1/bundles/apply", {
        planId: plan.id,
        expectedRevision: plan.basedOnRevision,
      });
      const msg = t(r.restartRequired ? "installation.appliedRestart" : "installation.applied");
      setMessage(msg);
      toast.success(msg);
      setPlan(undefined);
      await reload();
    } catch (err) {
      toast.error(`Failed to apply preset: ${String(err)}`);
    }
  };

  const toggle = async (p: Plugin) => {
    try {
      await postJson(`/api/v1/plugins/${encodeURIComponent(p.id)}/${p.enabled ? "disable" : "enable"}`);
      toast.success(`Plugin ${p.id} ${p.enabled ? "disabled" : "enabled"}`);
      await reload();
    } catch (err) {
      toast.error(`Failed to toggle plugin: ${String(err)}`);
    }
  };

  return (
    <div className="grid">
      <Card title={t("installation.title")}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <b style={{ color: "var(--amber-bright)", fontFamily: "var(--font-mono)" }}>
            {t("installation.current", { bundle: (current?.bundle ?? "default").toUpperCase() })}
          </b>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "12px", margin: "0 0 16px" }}>
          {t("installation.note")}
        </p>

        <div className="bundle-grid">
          {catalog.map((b) => {
            const isCurrent = current?.bundle === b.id;
            return (
              <article key={b.id} className={`bundle-card ${isCurrent ? "active-bundle" : ""}`}>
                <div className="bundle-card-header">
                  <div className="bundle-card-title">
                    <span className="bundle-icon">📦</span>
                    <span>{b.label}</span>
                  </div>
                  {isCurrent && <span className="bundle-active-badge">{t("installation.currentBadge")}</span>}
                </div>
                <p className="bundle-card-desc">{b.description}</p>
                <div className="bundle-features-list">
                  {b.features.map((feat) => (
                    <span key={feat} className="bundle-feature-tag">
                      {feat}
                    </span>
                  ))}
                </div>
                <button
                  className={isCurrent ? "bundle-btn is-current" : "bundle-btn primary"}
                  onClick={() => void preview(b.id)}
                >
                  {t("installation.preview")}
                </button>
              </article>
            );
          })}
        </div>

        <details className="custom-bundle-details">
          <summary>{t("installation.custom")}</summary>
          <div className="custom-features-grid">
            {features.map((f) => (
              <label key={f} className="custom-feature-item">
                <input
                  type="checkbox"
                  checked={custom.includes(f)}
                  onChange={(e) =>
                    setCustom(e.target.checked ? [...custom, f] : custom.filter((i) => i !== f))
                  }
                />
                <span>{f}</span>
              </label>
            ))}
          </div>
          <button
            className="primary"
            disabled={!custom.length}
            onClick={() => void preview("custom")}
            style={{ marginTop: 8 }}
          >
            {t("installation.previewCustom")}
          </button>
        </details>

        {plan && (
          <div className="plan-box">
            <div className="plan-title">
              {t("installation.plan", { revision: plan.basedOnRevision, preset: plan.preset })}
            </div>
            <p className="plan-diff-item">
              <span style={{ color: "var(--led-green)" }}>+ </span>
              {t("installation.add", { features: plan.add.join(", ") || t("installation.none") })}
            </p>
            <p className="plan-diff-item">
              <span style={{ color: "var(--led-red)" }}>- </span>
              {t("installation.remove", { features: plan.remove.join(", ") || t("installation.none") })}
            </p>
            <p className="plan-diff-item">
              <span style={{ color: "var(--amber)" }}>⚠ </span>
              {t("installation.review", {
                capabilities: plan.requiredCapabilities.join(", ") || t("installation.none"),
              })}
            </p>
            <button className="primary" onClick={() => void apply()} style={{ alignSelf: "flex-start", marginTop: 4 }}>
              {t("installation.apply")}
            </button>
          </div>
        )}

        {message && (
          <p style={{ color: "var(--led-green)", fontFamily: "var(--font-mono)", fontSize: "12px", marginTop: 12 }}>
            {message}
          </p>
        )}
      </Card>

      <Card title={t("installation.plugins")}>
        <p style={{ color: "var(--text-muted)", fontSize: "12px", margin: "0 0 12px" }}>
          {t("installation.states")}
        </p>
        {plugins.length ? (
          plugins.map((p) => (
            <article key={p.id} className="plugin-article">
              <div className="plugin-header">
                <div className="plugin-name">
                  <span>🔌 {p.manifest?.name ?? p.id}</span>
                  <code>{p.manifest?.version || "1.0.0"}</code>
                </div>
                <button
                  className={p.enabled ? "danger" : "primary"}
                  onClick={() => void toggle(p)}
                  style={{ padding: "4px 10px", fontSize: "11px" }}
                >
                  {t(p.enabled ? "installation.disable" : "installation.enable")}
                </button>
              </div>

              {p.manifest?.description && (
                <p style={{ margin: "2px 0", fontSize: "12px", color: "var(--text-muted)" }}>
                  {p.manifest.description}
                </p>
              )}

              <small style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                {t("installation.health", {
                  health: p.health,
                  grants: p.grantedCapabilities.join(", ") || t("installation.noGrants"),
                })}
                {p.missingCapabilities.length
                  ? t("installation.missing", { items: p.missingCapabilities.join(", ") })
                  : ""}
              </small>

              {p.error && (
                <p style={{ color: "var(--led-red)", fontFamily: "var(--font-mono)", fontSize: "11px", margin: "4px 0 0" }}>
                  {p.error}
                </p>
              )}
            </article>
          ))
        ) : (
          <p style={{ color: "var(--text-muted)", margin: 0 }}>{t("installation.noPlugins")}</p>
        )}
      </Card>
    </div>
  );
}

