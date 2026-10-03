import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { LoginInput, UserDto } from '@ccp/shared';
import { api, ApiError } from './api';

interface AuthState {
  user: UserDto | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api<{ user: UserDto }>('/api/auth/me')).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
  });

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => api<{ user: UserDto }>('/api/auth/login', { method: 'POST', body: input }),
    onSuccess: ({ user }) => {
      qc.clear();
      qc.setQueryData(['me'], user);
    },
  });
  const logoutMutation = useMutation({
    mutationFn: () => api('/api/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  });

  const value = useMemo<AuthState>(
    () => ({
      user: me.data ?? null,
      loading: me.isLoading,
      login: async (input) => void (await loginMutation.mutateAsync(input)),
      logout: async () => void (await logoutMutation.mutateAsync()),
    }),
    [me.data, me.isLoading, loginMutation, logoutMutation],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus di dalam AuthProvider');
  return ctx;
}
