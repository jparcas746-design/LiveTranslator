"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import type { ToastItem } from "@/hooks/useToast";

type ToastViewportProps = {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
};

function iconByType(type: ToastItem["type"]) {
  if (type === "success") return CheckCircle2;
  if (type === "error") return AlertCircle;
  return Info;
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => {
        const Icon = iconByType(toast.type);

        return (
          <article key={toast.id} className={`toast toast-${toast.type}`} role="status">
            <Icon size={18} aria-hidden="true" />
            <div className="toast-content">
              <strong>{toast.title}</strong>
              {toast.description ? <span>{toast.description}</span> : null}
            </div>
            <button
              className="icon-btn"
              type="button"
              aria-label="Dismiss notification"
              onClick={() => onDismiss(toast.id)}
            >
              <X size={16} />
            </button>
          </article>
        );
      })}
    </div>
  );
}
