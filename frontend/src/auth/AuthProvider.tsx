// src/auth/AuthProvider.tsx
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { api } from "@/lib/api"; // ensure api.ts uses withCredentials: true

type User = { username: string };
type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get("/auth/me");     // cookie travels via withCredentials
      setUser(res.data?.user ?? null);
    } catch {
      setUser(null);
    }
  }, []);

  // initial auth check on mount
  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = async (username: string, password: string) => {
    setLoading(true);
    try {
      await api.post("/auth/login", { username, password });
      await refresh();                           // re-fetch user after cookie is set
    } catch (e) {
      setUser(null);
      throw e;                                   // let caller show error toast
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      // ask backend to clear cookie on its domain
      await api.post("/auth/logout").catch(() => {});
    } finally {
      // regardless of network hiccups, drop local session immediately
      setUser(null);
      setLoading(false);
    }
  };

  return (
    <Ctx.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
