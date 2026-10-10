import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
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
    // Cookie sesi dipakai bersama semua tab di satu browser: login sebagai peran lain di tab kedua mengganti sesi tab pertama.
    // Cek ulang saat tab kembali aktif agar tampilan tidak menampilkan peran yang sudah tidak berlaku.
    refetchOnWindowFocus: 'always',
    staleTime: 0,
  });

  // Pengguna berubah (login lain di tab lain, atau keluar): buang data peran sebelumnya agar tidak bocor ke tampilan baru.
  const lastId = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (me.data === undefined) return;
    const id = me.data?.id ?? null;
    if (lastId.current !== undefined && lastId.current !== id) qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    lastId.current = id;
  }, [me.data, qc]);

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
