import React, { useEffect, useState } from "react";

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
  return (
    <div className={"tape-deck-reels " + (active ? "active" : "")} title={active ? "Tape Transport: Running" : "Tape Transport: Idle"}>
      <div className="tape-reel" />
      <span style={{ font: "9px var(--font-mono)", color: active ? "var(--amber)" : "var(--text-dim)" }}>
        {active ? "TAPE RUN" : "DECK STOP"}
      </span>
      <div className="tape-reel" />
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
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
          <button className="modal-close" onClick={onClose} aria-label="Close modal">×</button>
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
        {submitting ? "SAVING..." : "COMMIT RECORD"}
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
