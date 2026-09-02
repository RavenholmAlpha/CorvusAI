import React, { useEffect, useState } from "react";
import { defineTranslations, useI18n } from "./i18n";

defineTranslations({
  "components.transport.runningTitle": { en: "Tape Transport: Running", "zh-CN": "磁带传输：运行中" },
  "components.transport.idleTitle": { en: "Tape Transport: Idle", "zh-CN": "磁带传输：空闲" },
  "components.transport.running": { en: "TAPE RUN", "zh-CN": "磁带运行" },
  "components.transport.stopped": { en: "DECK STOP", "zh-CN": "卡座停止" },
  "components.modal.close": { en: "Close modal", "zh-CN": "关闭对话框" },
  "components.form.saving": { en: "SAVING...", "zh-CN": "保存中..." },
  "components.form.commit": { en: "COMMIT RECORD", "zh-CN": "提交记录" },
});

export function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="card">
      <header>
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function TapeDeckReels({ active }: { active?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={"tape-deck-reels " + (active ? "active" : "")} title={t(active ? "components.transport.runningTitle" : "components.transport.idleTitle")}>
      <div className="tape-reel" />
      <span style={{ font: "9px var(--font-mono)", color: active ? "var(--amber)" : "var(--text-dim)" }}>
        {t(active ? "components.transport.running" : "components.transport.stopped")}
      </span>
      <div className="tape-reel" />
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="backdrop" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <section className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label={t("components.modal.close")}>×</button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function SimpleForm({
  fields,
  onSubmit,
}: {
  fields: Array<{ name: string; label?: string; type?: string; placeholder?: string }>;
  onSubmit: (value: Record<string, string>) => Promise<void>;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(value);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {fields.map((f) => {
        const isLongText = f.name === "prompt" || f.name === "systemPrompt" || f.name === "content";
        return (
          <label key={f.name}>
            <span>{f.label || f.name}</span>
            {isLongText ? (
              <textarea
                value={value[f.name] || ""}
                placeholder={f.placeholder || f.name}
                onChange={(e) => setValue((v) => ({ ...v, [f.name]: e.target.value }))}
              />
            ) : (
              <input
                type={f.type || (f.name.toLowerCase().includes("key") && !f.name.includes("Ref") ? "password" : "text")}
                value={value[f.name] || ""}
                placeholder={f.placeholder || f.name}
                onChange={(e) => setValue((v) => ({ ...v, [f.name]: e.target.value }))}
              />
            )}
          </label>
        );
      })}
      <button className="primary" type="submit" disabled={submitting}>
        {t(submitting ? "components.form.saving" : "components.form.commit")}
      </button>
    </form>
  );
}

// Global Toast System
export interface ToastItem {
  id: string;
  message: string;
  type: "info" | "success" | "error";
}

let toastListeners: Array<(toasts: ToastItem[]) => void> = [];
let currentToasts: ToastItem[] = [];

function notifyToasts() {
  toastListeners.forEach((fn) => fn([...currentToasts]));
}

export const toast = {
  show(message: string, type: "info" | "success" | "error" = "info", durationMs = 3500) {
    const id = "toast_" + Math.random().toString(36).slice(2, 9);
    const item: ToastItem = { id, message, type };
    currentToasts = [...currentToasts, item];
    notifyToasts();
    setTimeout(() => {
      currentToasts = currentToasts.filter((t) => t.id !== id);
      notifyToasts();
    }, durationMs);
  },
  success(message: string) {
    toast.show(message, "success");
  },
  error(message: string) {
    toast.show(message, "error", 5000);
  },
  info(message: string) {
    toast.show(message, "info");
  },
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    toastListeners.push(setToasts);
    return () => {
      toastListeners = toastListeners.filter((fn) => fn !== setToasts);
    };
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((item) => (
        <div key={item.id} className={"toast " + item.type}>
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}

export function ZoomControl({
  zoom,
  onZoomChange,
}: {
  zoom: number;
  onZoomChange: (zoom: number) => void;
}) {
  const { t } = useI18n();
  const [openPresets, setOpenPresets] = useState(false);
  const presets = [70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 125, 135, 150];

  useEffect(() => {
    const handleClose = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".zoom-controller")) {
        setOpenPresets(false);
      }
    };
    if (openPresets) {
      window.addEventListener("click", handleClose);
      return () => window.removeEventListener("click", handleClose);
    }
  }, [openPresets]);

  return (
    <div className="zoom-controller" style={{ position: "relative" }}>
      <button
        type="button"
        className="zoom-btn"
        onClick={() => onZoomChange(Math.max(60, zoom - 5))}
        title={t("app.zoomOut") || "Zoom Out (-5%) [Ctrl -]"}
      >
        －
      </button>
      <span
        className="zoom-badge"
        onClick={(e) => {
          e.stopPropagation();
          setOpenPresets((prev) => !prev);
        }}
        title={t("app.zoomPresets") || "Click to choose zoom level"}
      >
        {zoom}%
      </span>
      <button
        type="button"
        className="zoom-btn"
        onClick={() => onZoomChange(Math.min(180, zoom + 5))}
        title={t("app.zoomIn") || "Zoom In (+5%) [Ctrl +]"}
      >
        ＋
      </button>
      {zoom !== 100 && (
        <button
          type="button"
          className="zoom-btn"
          onClick={() => onZoomChange(100)}
          title={t("app.zoomReset") || "Reset zoom (100%) [Ctrl 0]"}
          style={{ color: "var(--amber)", fontSize: "10px" }}
        >
          ⟲
        </button>
      )}

      {openPresets && (
        <div className="zoom-presets-menu" onClick={(e) => e.stopPropagation()}>
          <div style={{ font: "9px var(--font-mono)", color: "var(--amber)", padding: "2px 6px", borderBottom: "1px dashed var(--border-dark)" }}>
            UI SCALE
          </div>
          {presets.map((val) => (
            <button
              key={val}
              type="button"
              className={"zoom-preset-item " + (zoom === val ? "active" : "")}
              onClick={() => {
                onZoomChange(val);
                setOpenPresets(false);
              }}
            >
              <span>{val}%</span>
              {val === 100 && <span style={{ fontSize: "9px", opacity: 0.7 }}>[DEF]</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
