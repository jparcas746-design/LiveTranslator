"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Loader2, Lock, Shield } from "lucide-react";
import { fetchJson } from "@/lib/fetchJson";

function resolveNextPath(rawNextPath: string | null) {
  if (!rawNextPath || !rawNextPath.startsWith("/admin")) {
    return "/admin";
  }

  return rawNextPath;
}

export default function AdminLoginPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nextPath, setNextPath] = useState("/admin");

  useEffect(() => {
    const rawNext = new URLSearchParams(window.location.search).get("next");
    setNextPath(resolveNextPath(rawNext));
  }, []);

  const checkSession = useCallback(async () => {
    const result = await fetchJson<{ authenticated: boolean }>("/api/admin/session", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    if (result.ok && result.data.authenticated) {
      router.replace(nextPath);
      return;
    }

    setIsChecking(false);
  }, [nextPath, router]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  async function submitLogin() {
    setErrorMessage(null);
    setIsSubmitting(true);

    const result = await fetchJson<{ authenticated: boolean }>("/api/admin/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!result.ok) {
      if (result.status === 401) {
        setErrorMessage("Contraseña incorrecta.");
      } else {
        setErrorMessage(result.message || "No se pudo iniciar sesión.");
      }
      setIsSubmitting(false);
      return;
    }

    router.replace(nextPath);
  }

  return (
    <main className="admin-auth-shell admin-grid-bg">
      <div className="admin-auth-card">
        <div className="admin-auth-badge">Acceso editorial</div>
        <div className="admin-auth-head">
          <div className="admin-auth-icon">
            <Shield size={22} />
          </div>
          <div>
            <h1>Panel Signipedia</h1>
            <p>Acceso privado para administrar símbolos, categorías y contenido editorial.</p>
          </div>
        </div>

        {isChecking ? (
          <div className="admin-auth-progress" role="status" aria-live="polite">
            <Loader2 size={16} className="animate-spin" />
            <span>Verificando sesión activa...</span>
          </div>
        ) : (
          <>
            <label className="admin-auth-label">
              Contraseña
              <div className="admin-auth-input-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void submitLogin();
                    }
                  }}
                  className="admin-auth-input"
                  placeholder="Introduce la contraseña"
                  autoComplete="current-password"
                />
                <button type="button" className="admin-auth-toggle" onClick={() => setShowPassword((current) => !current)}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  <span>{showPassword ? "Ocultar" : "Mostrar"}</span>
                </button>
              </div>
            </label>

            {errorMessage ? <div className="admin-auth-error">{errorMessage}</div> : null}

            <button type="button" onClick={() => void submitLogin()} disabled={isSubmitting || !password.trim()} className="admin-auth-submit">
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
              {isSubmitting ? "Validando acceso..." : "Entrar al panel"}
            </button>
          </>
        )}

        <Link href="/" className="admin-auth-return">
          <ArrowLeft size={14} />
          Volver a Signipedia
        </Link>
      </div>
    </main>
  );
}
