import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  getGetCurrentUserQueryKey,
} from '@workspace/api-client-react';
import { getFriendlyErrorMessage } from '@/lib/errorMessages';
import { AuthContext, PERMISSIONS, fromSession, type AuthUser } from './auth';

export { useAuth, type AuthUser } from './auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getCurrentUser();
        if (!cancelled) setUser(fromSession(res.user));
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<{ ok: true } | { ok: false; message: string }> => {
    try {
      const res = await loginRequest({ username, password });
      setUser(fromSession(res.user));
      await queryClient.invalidateQueries();
      queryClient.setQueryData(getGetCurrentUserQueryKey(), { user: res.user });
      return { ok: true };
    } catch (err: unknown) {
      const message = getFriendlyErrorMessage(err, 'Sign in failed. Please try again.');
      return { ok: false, message };
    }
  }, [queryClient]);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await logoutRequest();
    } catch {
      // Even if the network call fails, drop the local session.
    }
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const refreshSession = useCallback(async (): Promise<void> => {
    try {
      const res = await getCurrentUser();
      setUser(fromSession(res.user));
      queryClient.setQueryData(getGetCurrentUserQueryKey(), { user: res.user });
    } catch {
      setUser(null);
    }
  }, [queryClient]);

  const can = useCallback((action: string): boolean => {
    if (!user) return false;
    const allowed = PERMISSIONS[action];
    if (!allowed) return false;
    return allowed.includes(user.role);
  }, [user]);

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!user, isLoading, user, login, logout, refreshSession, can }}>
      {children}
    </AuthContext.Provider>
  );
}
