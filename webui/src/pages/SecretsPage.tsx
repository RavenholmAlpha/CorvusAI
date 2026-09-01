import React, { useEffect, useState } from "react";
import { deleteJson, getJson, postJson } from "../api";
import { Card } from "../components";
import { defineTranslations, useI18n } from "../i18n";

defineTranslations({
  "secrets.title": { en: "Encrypted Secrets", "zh-CN": "加密密钥" },
  "secrets.description": { en: "Secrets are encrypted locally with AES-256-GCM. Set {variable} before using this page.", "zh-CN": "密钥使用 AES-256-GCM 在本地加密。使用此页面前请设置 {variable}。" },
  "secrets.namePlaceholder": { en: "SECRET_NAME", "zh-CN": "密钥名称" },
  "secrets.valuePlaceholder": { en: "Secret value", "zh-CN": "密钥值" },
  "secrets.store": { en: "Store", "zh-CN": "存储" },
});

export function SecretsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Array<{ name: string; configured: boolean }>>([]);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const reload = () => getJson<Array<{ name: string; configured: boolean }>>("/api/v1/secrets").then(setItems).catch(reason => setError(String(reason)));
  useEffect(() => { void reload(); }, []);
  const save = async () => { try { await postJson("/api/v1/secrets", { name, value }); setName(""); setValue(""); setError(""); await reload(); } catch (reason) { setError(String(reason)); } };
  return <div className="grid"><Card title={t("secrets.title")}><p>{t("secrets.description", { variable: "CORVUS_SECRET_PASSWORD" }).split("CORVUS_SECRET_PASSWORD")[0]}<code>CORVUS_SECRET_PASSWORD</code>{t("secrets.description", { variable: "CORVUS_SECRET_PASSWORD" }).split("CORVUS_SECRET_PASSWORD")[1]}</p><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input value={name} onChange={e => setName(e.target.value)} placeholder={t("secrets.namePlaceholder")} /><input type="password" value={value} onChange={e => setValue(e.target.value)} placeholder={t("secrets.valuePlaceholder")} /><button disabled={!name || !value} onClick={() => void save()}>{t("secrets.store")}</button></div>{error && <p style={{ color: "var(--led-red)" }}>{error}</p>}{items.map(item => <article key={item.name} style={{ borderTop: "1px solid var(--border-dark)", padding: "10px 0", display: "flex", justifyContent: "space-between" }}><code>{item.name}</code><button onClick={() => void deleteJson("/api/v1/secrets/" + encodeURIComponent(item.name)).then(reload)}>{t("common.delete")}</button></article>)}</Card></div>;
}
