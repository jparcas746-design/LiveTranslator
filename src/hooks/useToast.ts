"use client";

import { useCallback, useState } from "react";

export type ToastType = "success" | "error" | "info";

export type ToastItem = {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
};

const TOAST_DURATION_MS = 3200;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, title: string, description?: string) => {
      const id = crypto.randomUUID();
      const toast: ToastItem = { id, type, title, description };

      setToasts((prev) => [toast, ...prev].slice(0, 4));
      window.setTimeout(() => removeToast(id), TOAST_DURATION_MS);
    },
    [removeToast]
  );

  return {
    toasts,
    removeToast,
    showToast,
  };
}
