import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export interface Application {
  id: string;
  status: "pending" | "accepted" | "rejected" | "revoked";
  created_at: string;
  reviewer_note?: string;
}

export interface User {
  discord_id: string;
  username: string;
  avatar: string | null;
  avatar_hash?: string | null;
  in_guild: boolean;
  is_staff: boolean;
  staff_tier?: "owner" | "webdev" | "admin" | null;
  is_private: boolean;
  is_corporal_or_higher: boolean;
  is_koth: boolean;
  is_unverified: boolean;
  effective_status: "accepted" | "koth" | "unverified" | "none";
  application: Application | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  lastUpdated: number | null;
  refresh: () => Promise<void>;
  silentRefresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  lastUpdated: null,
  refresh: async () => {},
  silentRefresh: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // Full refresh — shows loading spinner (initial load, explicit refresh)
  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/.netlify/functions/me");
      const data = await res.json();
      setUser(data.user ?? null);
      setLastUpdated(Date.now());
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Silent refresh — no loading spinner (polling, tab focus)
  const silentRefresh = useCallback(async () => {
    try {
      const res = await fetch("/.netlify/functions/me");
      const data = await res.json();
      setUser(data.user ?? null);
      setLastUpdated(Date.now());
    } catch {
      // silent fail — keep current user, don't flash error
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <AuthContext.Provider
      value={{ user, loading, lastUpdated, refresh: fetchUser, silentRefresh }}
    >
      {children}
    </AuthContext.Provider>
  );
};
