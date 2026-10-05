"use client";

import React, { createContext, useCallback, useContext, useMemo } from "react";
import useSWR from "swr";
import { usePathname } from "next/navigation";
import { api, swrFetcher } from "./api";
import type { SessionInfo } from "./types/session";

interface SessionContextValue {
  session: SessionInfo | null;
  isLoading: boolean;
  /** Có ít nhất một trong các quyền */
  can: (permission: string | string[]) => boolean;
  hasRole: (role: string | string[]) => boolean;
  refreshSession: () => Promise<SessionInfo | undefined>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const skip = pathname === "/dang-nhap";
  const { data, isLoading, mutate } = useSWR<SessionInfo>(skip ? null : "/api/v1/auth/me", swrFetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 15_000,
    shouldRetryOnError: false,
  });

  const can = useCallback(
    (p: string | string[]) => {
      if (data?.roles.includes("admin")) return true;
      const perms = data?.permissions ?? [];
      return (Array.isArray(p) ? p : [p]).some((x) => perms.includes(x));
    },
    [data]
  );
  const hasRole = useCallback(
    (r: string | string[]) => {
      if (data?.roles.includes("admin")) return true;
      return (Array.isArray(r) ? r : [r]).some((x) => data?.roles.includes(x));
    },
    [data]
  );
  const logout = useCallback(async () => {
    try {
      await api.post("/api/v1/auth/logout");
    } finally {
      await mutate(undefined, { revalidate: false });
      window.location.href = "/dang-nhap";
    }
  }, [mutate]);

  const value = useMemo<SessionContextValue>(
    () => ({ session: data ?? null, isLoading, can, hasRole, refreshSession: () => mutate(), logout }),
    [data, isLoading, can, hasRole, mutate, logout]
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession phải nằm trong <SessionProvider>");
  return ctx;
}

/** Chỉ hiện children khi người dùng có quyền. */
export function Can({ permission, children, fallback = null }: { permission: string | string[]; children: React.ReactNode; fallback?: React.ReactNode }) {
  const { can } = useSession();
  return <>{can(permission) ? children : fallback}</>;
}
