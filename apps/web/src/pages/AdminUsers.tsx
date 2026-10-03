import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ROLES, ROLE_LABEL, type Role, type UserDto } from '@ccp/shared';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge, Button, Card, Drawer, Field, Input, Select } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Draft {
  id?: number;
  email: string;
  name: string;
  role: Role;
  unit: string;
  jabatan: string;
  active: boolean;
  password: string;
}

const EMPTY: Draft = { email: '', name: '', role: 'user', unit: '', jabatan: '', active: true, password: '' };
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : e ? 'Terjadi kesalahan' : undefined);

export function AdminUsers() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [notice, setNotice] = useState('');

  const users = useQuery({ queryKey: ['users'], queryFn: () => api<{ users: UserDto[] }>('/api/users') });
  const close = () => {
    setDraft(null);
    setNewPassword('');
    setNotice('');
  };

  const save = useMutation({
    mutationFn: (d: Draft) =>
      d.id
        ? api(`/api/users/${d.id}`, { method: 'PATCH', body: { name: d.name, role: d.role, unit: d.unit, jabatan: d.jabatan, active: d.active } })
        : api('/api/users', { method: 'POST', body: d }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['users'] });
      close();
    },
  });
  const reset = useMutation({
    mutationFn: (id: number) => api(`/api/users/${id}/reset-password`, { method: 'POST', body: { newPassword } }),
    onSuccess: () => {
      setNewPassword('');
      setNotice('Password direset. Semua sesi pengguna ini dicabut.');
    },
  });

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const isEdit = draft?.id !== undefined;
  const isSelf = draft?.id === me?.id;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (draft) save.mutate(draft);
  }

  return (
    <>
      <PageHeader
        title="Kelola Pengguna"
        subtitle="Akun, peran, dan status aktif. Perubahan peran atau penonaktifan langsung mengeluarkan pengguna dari sesinya."
        actions={
          <Button onClick={() => { save.reset(); setDraft(EMPTY); }}>
            <Plus size={15} /> Tambah Pengguna
          </Button>
        }
      />
      <div className="px-7 pb-8 pt-2">
        <Card className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line bg-canvas text-left text-xs font-semibold text-muted">
                {['Nama', 'Email', 'Peran', 'Unit', 'Status'].map((h) => (
                  <th key={h} className="px-3.5 py-2.5">{h}</th>
                ))}
                <th className="px-3.5 py-2.5"><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody>
              {users.isLoading && <tr><td colSpan={6} className="px-3.5 py-6 text-center text-faint">Memuat…</td></tr>}
              {users.isError && <tr><td colSpan={6} className="px-3.5 py-6 text-center text-danger">{errMsg(users.error)}</td></tr>}
              {users.data?.users.map((u) => (
                <tr key={u.id} className="border-b border-line-soft last:border-0 hover:bg-brand-50/40">
                  <td className="px-3.5 py-2.5 font-semibold">{u.name}</td>
                  <td className="px-3.5 py-2.5 text-muted">{u.email}</td>
                  <td className="px-3.5 py-2.5"><Badge tone="blue">{ROLE_LABEL[u.role]}</Badge></td>
                  <td className="px-3.5 py-2.5 text-muted">{u.unit || '—'}</td>
                  <td className="px-3.5 py-2.5"><Badge tone={u.active ? 'green' : 'slate'}>{u.active ? 'Aktif' : 'Nonaktif'}</Badge></td>
                  <td className="px-3.5 py-2.5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => { save.reset(); setNotice(''); setDraft({ ...u, password: '' }); }}>Ubah</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Drawer
        open={draft !== null}
        title={isEdit ? 'Ubah Pengguna' : 'Tambah Pengguna'}
        subtitle={draft?.email || undefined}
        onClose={close}
        footer={
          <>
            <Button variant="ghost" full onClick={close}>Batal</Button>
            <Button full type="submit" form="user-form" disabled={save.isPending || !draft?.name || (!isEdit && (!draft?.email || (draft?.password.length ?? 0) < 8))}>
              {save.isPending ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </>
        }
      >
        {draft && (
          <>
            <form id="user-form" onSubmit={submit}>
              <Field label="Nama" required>{(id) => <Input id={id} value={draft.name} onChange={(e) => patch({ name: e.target.value })} required />}</Field>
              <Field label="Email" required>
                {(id) => <Input id={id} type="email" value={draft.email} readOnly={isEdit} onChange={(e) => patch({ email: e.target.value })} required />}
              </Field>
              <Field label="Peran" required hint={isSelf ? 'Anda tidak bisa menurunkan peran akun sendiri.' : undefined}>
                {(id) => (
                  <Select id={id} value={draft.role} disabled={isSelf} onChange={(e) => patch({ role: e.target.value as Role })}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </Select>
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Unit / Divisi">{(id) => <Input id={id} value={draft.unit} onChange={(e) => patch({ unit: e.target.value })} />}</Field>
                <Field label="Jabatan">{(id) => <Input id={id} value={draft.jabatan} onChange={(e) => patch({ jabatan: e.target.value })} />}</Field>
              </div>
              {!isEdit && (
                <Field label="Password awal" required hint="Minimal 8 karakter. Sampaikan ke pengguna; mereka bisa menggantinya di Akun Saya.">
                  {(id) => <Input id={id} type="password" autoComplete="new-password" value={draft.password} onChange={(e) => patch({ password: e.target.value })} required />}
                </Field>
              )}
              {isEdit && (
                <label className="mb-4 flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={draft.active} disabled={isSelf} onChange={(e) => patch({ active: e.target.checked })} className="h-4 w-4 accent-brand-600" />
                  Akun aktif
                </label>
              )}
              {errMsg(save.error) && <p role="alert" className="mb-3 text-[12.5px] text-danger">{errMsg(save.error)}</p>}
            </form>

            {isEdit && draft.id !== undefined && (
              <section className="mt-2 border-t border-line pt-4">
                <h3 className="mb-3 text-[13px] font-bold">Reset password</h3>
                <Field label="Password baru" hint="Minimal 8 karakter." error={errMsg(reset.error)}>
                  {(id) => <Input id={id} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />}
                </Field>
                {notice && <p role="status" className="mb-3 text-[12.5px] font-medium text-ok">{notice}</p>}
                <Button variant="danger" size="sm" disabled={reset.isPending || newPassword.length < 8} onClick={() => reset.mutate(draft.id!)}>
                  Reset password
                </Button>
              </section>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
