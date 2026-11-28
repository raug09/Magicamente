import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { request, setUnauthorizedHandler } from '../api/client';
import type { User } from '../api/types';
import { clearToken, getToken, setToken } from './session';

interface AuthState {
  user: User | null;
  /** true mientras se comprueba la sesión guardada. */
  loading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export const ME_KEY = ['auth', 'me'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const hasToken = getToken() !== null;

  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: () => request<User>('/api/auth/me'),
    enabled: hasToken,
    retry: false,
  });

  const logout = useCallback(() => {
    clearToken();
    queryClient.removeQueries({ queryKey: ME_KEY });
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      queryClient.removeQueries({ queryKey: ME_KEY });
      queryClient.clear();
    });
  }, [queryClient]);

  const login = useCallback(
    async (token: string) => {
      setToken(token);
      await queryClient.fetchQuery({ queryKey: ME_KEY, queryFn: () => request<User>('/api/auth/me') });
    },
    [queryClient]
  );

  const value = useMemo<AuthState>(
    () => ({
      user: hasToken && me.data ? me.data : null,
      loading: hasToken && me.isPending,
      login,
      logout,
    }),
    [hasToken, me.data, me.isPending, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthState => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return value;
};
