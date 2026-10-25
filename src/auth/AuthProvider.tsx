import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";

export type AccessStatus = "pending" | "approved" | "blocked";
export type AccessRole = "user" | "admin";

interface AuthState {
  /** true until the first session and access lookup have finished */
  loading: boolean;
  session: Session | null;
  status: AccessStatus | null;
  role: AccessRole | null;
  fullName: string | null;
  /** Re-read status and role from the server (e.g. after an admin approved the account). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface Access {
  status: AccessStatus;
  role: AccessRole;
  fullName: string | null;
}

/**
 * The status and role shown here are only for navigation. They are NOT a
 * security boundary: every table checks approval server-side through RLS.
 */
async function loadAccess(userId: string): Promise<Access | null> {
  const [access, profile] = await Promise.all([
    supabase.from("user_access").select("status, role").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  if (access.error || !access.data) return null;
  return {
    status: access.data.status as AccessStatus,
    role: access.data.role as AccessRole,
    fullName: (profile.data?.full_name as string | undefined) ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState<Access | null>(null);

  const applySession = useCallback(async (next: Session | null) => {
    setSession(next);
    setAccess(next ? await loadAccess(next.user.id) : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) void applySession(data.session);
    });
    // Do not call supabase functions synchronously inside this callback (deadlock risk); defer instead.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setTimeout(() => {
        if (active) void applySession(next);
      }, 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await applySession(data.session);
  }, [applySession]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      status: access?.status ?? null,
      role: access?.role ?? null,
      fullName: access?.fullName ?? null,
      refresh,
      signOut,
    }),
    [loading, session, access, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
