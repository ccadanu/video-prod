import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Button, Field, Input } from '../components/ui';
import { homePathFor } from '../lib/access';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { IS_DEMO } from '../lib/demo';
import { DEMO_PASSWORD } from '../lib/demoAccounts';
import logoFull from '../assets/logo-full.png';
import logoMark from '../assets/logo-mark.png';

const DEMO_QUICK = [
  ['User', 'arya@ccp.local'],
  ['Leader', 'leader@ccp.local'],
  ['Videografer', 'hardi@ccp.local'],
  ['Editor', 'dio@ccp.local'],
  ['Admin', 'admin@ccp.local'],
] as const;

export function Login() {
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={homePathFor(user.role)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    await attempt(email, password);
  }

  async function attempt(mail: string, pass: string) {
    setError('');
    setBusy(true);
    try {
      await login({ email: mail, password: pass });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Terjadi kesalahan');
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col items-center justify-center overflow-hidden bg-navy-900 px-12 text-white lg:flex">
        <div aria-hidden="true" className="weave absolute inset-0 text-white opacity-[0.05]" />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-tr from-navy-950 via-navy-900/80 to-navy-800/60" />
        <div className="relative z-10 flex max-w-sm flex-col items-center text-center">
          <img src={logoFull} alt="Adanu Adhinata Semesta" width={240} className="w-60" />
          <h2 className="mt-8 text-2xl font-bold leading-snug">Satu pintu untuk seluruh proses produksi video.</h2>
          <p className="mt-3 text-sm leading-relaxed text-[#9db6c9]">
            Dari brief, penjadwalan syuting, editing, sampai review — status tiap konten terlihat oleh semua pihak.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center bg-canvas px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm" noValidate>
          <img src={logoMark} alt="" width={36} height={50} className="mb-4 h-12 w-auto lg:hidden" />
          <h1 className="text-2xl font-bold">Masuk</h1>
          <p className="mb-7 mt-1 text-[13px] text-muted">CCP Video · PT Adanu Adhinata Semesta</p>

          <Field label="Email" required>
            {(id) => (
              <Input id={id} type="email" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@perusahaan.com" />
            )}
          </Field>
          <Field label="Password" required>
            {(id) => (
              <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            )}
          </Field>

          {error && (
            <p role="alert" className="mb-4 rounded-lg border border-[#f0c7c1] bg-[#fdf1ef] px-3 py-2 text-[12.5px] text-danger">
              {error}
            </p>
          )}
          <Button type="submit" full disabled={busy || !email || !password}>
            {busy ? 'Memproses…' : 'Masuk'}
          </Button>
          <p className="mt-5 text-center text-xs text-faint">Lupa password? Hubungi admin untuk reset.</p>

          {IS_DEMO && (
            <div className="mt-6 rounded-lg bg-orange-100 px-3 py-3 text-orange-800">
              <p className="mb-2 text-[11.5px] font-semibold">Mode pratinjau: masuk cepat sebagai</p>
              <div className="flex flex-wrap gap-1.5">
                {DEMO_QUICK.map(([label, mail]) => (
                  <button
                    key={mail}
                    type="button"
                    disabled={busy}
                    onClick={() => void attempt(mail, DEMO_PASSWORD)}
                    className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-navy-900 shadow-sm hover:bg-yellow-500 disabled:opacity-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {import.meta.env.DEV && !IS_DEMO && (
            <p className="mt-6 rounded-lg bg-brand-50 px-3 py-2 text-[11.5px] leading-relaxed text-brand-800">
              <b>Dev:</b> admin@, leader@, hardi@, yofa@, dio@, rara@, arya@<code>ccp.local</code> · password <code>Ccp#Demo2026</code> (jalankan <code>npm run seed</code>).
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
