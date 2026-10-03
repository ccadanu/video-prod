import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ROLE_LABEL } from '@ccp/shared';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, Field, Input } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

export function Account() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [done, setDone] = useState(false);

  const change = useMutation({
    mutationFn: () => api('/api/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setDone(true);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    change.mutate();
  }
  const error = change.error instanceof ApiError ? change.error.message : change.error ? 'Terjadi kesalahan' : undefined;

  return (
    <>
      <PageHeader title="Akun Saya" subtitle={user ? `${user.name} · ${ROLE_LABEL[user.role]}` : undefined} />
      <div className="px-7 pb-8 pt-2">
        <Card className="max-w-md p-6">
          <h2 className="mb-4 text-[15px] font-bold">Ganti password</h2>
          <form onSubmit={submit}>
            <Field label="Password saat ini" required>
              {(id) => <Input id={id} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />}
            </Field>
            <Field label="Password baru" required hint="Minimal 8 karakter." error={error}>
              {(id) => <Input id={id} type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />}
            </Field>
            {done && <p role="status" className="mb-3 text-[12.5px] font-medium text-ok">Password berhasil diganti.</p>}
            <Button type="submit" disabled={change.isPending || !current || next.length < 8}>
              {change.isPending ? 'Menyimpan…' : 'Simpan password'}
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
