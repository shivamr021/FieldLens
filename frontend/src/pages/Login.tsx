// src/pages/Login.tsx
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";

export default function Login() {
  const { login } = useAuth();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const loc = useLocation() as any;
  const from = loc.state?.from?.pathname ?? "/";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(u, p);
      nav(from, { replace: true });
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 grid place-items-center bg-background">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm border rounded-xl p-6 space-y-4 bg-card"
      >
        <h1 className="text-xl font-semibold text-center">Admin Login</h1>
        <div className="space-y-2">
          <label className="text-sm">Username</label>
          <input
            className="w-full border rounded-md px-3 h-9 bg-background"
            value={u}
            onChange={(e) => setU(e.target.value)}
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm">Password</label>
          <input
            className="w-full border rounded-md px-3 h-9 bg-background"
            type="password"
            value={p}
            onChange={(e) => setP(e.target.value)}
          />
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}

        <button
          disabled={loading}
          className="h-9 px-4 rounded-md bg-primary text-primary-foreground w-full flex items-center justify-center gap-2 disabled:opacity-60"
          type="submit"
        >
          {loading && (
            <svg
              className="h-4 w-4 animate-spin text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          )}
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
