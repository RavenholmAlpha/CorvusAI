import React, { useEffect, useState } from "react";
import { getAuthStatus, setWebToken } from "../api";
import { TapeDeckReels, toast } from "../components";
import { defineTranslations, useI18n } from "../i18n";

defineTranslations({
  "login.title": { en: "CORVUS CONTROL PLANE", "zh-CN": "CORVUS 工业控制中枢" },
  "login.subtitle": { en: "Authentication Required", "zh-CN": "安全身份验证" },
  "login.setupTitle": { en: "First Run Setup", "zh-CN": "首次初始化安全配置" },
  "login.setupDesc": {
    en: "Set a permanent administrator password. This will be stored securely in the database so you won't need random token URLs, and can deploy Corvus to any public server.",
    "zh-CN": "请设置固定的管理员密码。密码将加密保存在数据库中，无需每次查找长串随机 Token，随时支持部署至公网服务器直接访问。",
  },
  "login.passwordLabel": { en: "Access Password", "zh-CN": "访问密码" },
  "login.confirmPasswordLabel": { en: "Confirm Password", "zh-CN": "确认新密码" },
  "login.loginBtn": { en: "AUTHENTICATE & ENTER", "zh-CN": "验证并进入系统" },
  "login.setupBtn": { en: "SET PASSWORD & ENTER", "zh-CN": "保存密码并进入系统" },
  "login.submitting": { en: "VERIFYING...", "zh-CN": "正在验证..." },
  "login.passwordMismatch": { en: "Passwords do not match", "zh-CN": "两次输入的密码不一致" },
  "login.passwordTooShort": { en: "Password must be at least 4 characters", "zh-CN": "密码长度不能少于 4 位" },
  "login.loginSuccess": { en: "Authenticated successfully.", "zh-CN": "身份验证成功，欢迎使用 Corvus。" },
  "login.setupSuccess": { en: "Administrator password saved. Welcome!", "zh-CN": "管理密码设置成功并已持久化保存，欢迎使用！" },
  "login.toggleShow": { en: "Show", "zh-CN": "显示" },
  "login.toggleHide": { en: "Hide", "zh-CN": "隐藏" },
});

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const { t } = useI18n();
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let active = true;
    getAuthStatus()
      .then((status) => {
        if (!active) return;
        setInitialized(status.initialized);
        if (status.authenticated) {
          onLogin();
        }
      })
      .catch(() => {
        if (active) setInitialized(true);
      });
    return () => {
      active = false;
    };
  }, [onLogin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!password || password.length < 4) {
      setErrorMsg(t("login.passwordTooShort"));
      return;
    }

    if (!initialized) {
      if (password !== confirmPassword) {
        setErrorMsg(t("login.passwordMismatch"));
        return;
      }
    }

    setSubmitting(true);
    try {
      const endpoint = !initialized ? "/api/auth/setup" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(!initialized ? { password } : { username: username.trim() || "admin", password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }
      if (data.token) {
        setWebToken(data.token);
      }
      toast.success(!initialized ? t("login.setupSuccess") : t("login.loginSuccess"));
      onLogin();
    } catch (err: any) {
      setErrorMsg(err.message || "Authentication error");
    } finally {
      setSubmitting(false);
    }
  };

  if (initialized === null) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#08090c" }}>
        <div style={{ fontFamily: "var(--font-mono)", color: "var(--amber)", fontSize: "14px" }}>
          CONNECTING TO CONTROL PLANE...
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0c10",
        padding: "20px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "min(460px, 94vw)",
          background: "#12151d",
          border: "1px solid var(--amber)",
          borderRadius: "8px",
          padding: "32px 28px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.85), 0 0 24px var(--amber-glow)",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        {/* Header Branding */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-dark)", paddingBottom: "16px" }}>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "18px",
                color: "var(--amber)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "1px",
                fontWeight: 700,
              }}
            >
              {t("login.title")}
            </h1>
            <span style={{ fontSize: "11px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              {!initialized ? t("login.setupTitle") : t("login.subtitle")}
            </span>
          </div>
          <TapeDeckReels active={submitting} />
        </div>

        {/* Description for first time setup */}
        {!initialized && (
          <p
            style={{
              margin: 0,
              fontSize: "12px",
              lineHeight: 1.5,
              color: "var(--text-muted)",
              background: "rgba(255,122,0,0.06)",
              padding: "10px 12px",
              borderRadius: "4px",
              borderLeft: "3px solid var(--amber)",
            }}
          >
            {t("login.setupDesc")}
          </p>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "16px" }}>
          {initialized && (
            <label>
              <span style={{ color: "var(--text-main)", fontWeight: 600 }}>用户名 (Username)</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin 或协同成员用户名"
                required
                autoFocus={!username}
                style={{ fontSize: "14px", fontFamily: "var(--font-mono)" }}
              />
            </label>
          )}

          <label>
            <span style={{ color: "var(--text-main)", fontWeight: 600 }}>{t("login.passwordLabel")}</span>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={!initialized ? "设置管理员密码 (至少 4 位)" : "输入访问密码"}
                autoFocus={Boolean(username)}
                required
                style={{ flex: 1, fontSize: "14px", letterSpacing: showPassword ? "normal" : "2px" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                style={{ fontSize: "11px", padding: "8px 10px", background: "#171a24" }}
                title={showPassword ? t("login.toggleHide") : t("login.toggleShow")}
              >
                {showPassword ? "👁️‍🗨️" : "👁️"}
              </button>
            </div>
          </label>

          {!initialized && (
            <label>
              <span style={{ color: "var(--text-main)", fontWeight: 600 }}>{t("login.confirmPasswordLabel")}</span>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入以确认"
                required
                style={{ fontSize: "14px", letterSpacing: showPassword ? "normal" : "2px" }}
              />
            </label>
          )}

          {errorMsg && (
            <div
              style={{
                color: "var(--led-red)",
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                background: "rgba(255, 69, 58, 0.1)",
                border: "1px solid var(--led-red)",
                padding: "8px 12px",
                borderRadius: "4px",
              }}
            >
              ⚠ {errorMsg}
            </div>
          )}

          <button
            type="submit"
            className="primary"
            disabled={submitting}
            style={{
              padding: "12px",
              fontSize: "13px",
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              letterSpacing: "1px",
              marginTop: "8px",
            }}
          >
            {submitting ? t("login.submitting") : !initialized ? t("login.setupBtn") : t("login.loginBtn")}
          </button>
        </form>

        {/* Footer Info */}
        <div style={{ textAlign: "center", borderTop: "1px solid var(--border-dark)", paddingTop: "12px" }}>
          <small style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
            Corvus Control Plane · Web Engine 0.2.2 · Safe for Public Servers
          </small>
        </div>
      </div>
    </div>
  );
}
