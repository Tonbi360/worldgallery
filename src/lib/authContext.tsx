'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { dbGetMe, dbLogout } from './dataService';

export interface AuthUser {
  id: string;
  email: string;
  role: 'curator' | 'member';
  name?: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  profile: any | null;
  isAuthenticated: boolean;
  isCurator: boolean;
  isLoading: boolean;
  refreshAuth: () => Promise<{ ok: boolean; user?: any; profile?: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  isAuthenticated: false,
  isCurator: false,
  isLoading: true,
  refreshAuth: async () => ({ ok: false }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAuth = useCallback(async () => {
    try {
      const res = await dbGetMe();
      if (res.ok && res.user) {
        setUser(res.user);
        setProfile(res.profile || null);
        return res;
      } else {
        setUser(null);
        setProfile(null);
        return { ok: false };
      }
    } catch {
      setUser(null);
      setProfile(null);
      return { ok: false };
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const signOut = useCallback(async () => {
    await dbLogout();
    setUser(null);
    setProfile(null);
  }, []);

  const value: AuthContextType = {
    user,
    profile,
    isAuthenticated: !!user,
    isCurator: user?.role === 'curator',
    isLoading,
    refreshAuth,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}
