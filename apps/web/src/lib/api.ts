export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Alamat backend. Kosong = satu origin (web dan /api dilayani reverse proxy yang sama; disarankan).
 * Isi VITE_API_BASE_URL=https://api.contoh.internal bila API berada di host lain (lihat docs/PORTABILITAS.md).
 */
const BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/$/, '');

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

export async function api<T>(path: string, { method = 'GET', body }: Options = {}): Promise<T> {
  if (import.meta.env.VITE_DEMO === '1') {
    const { demoApi } = await import('./demoApi');
    return demoApi<T>(path, method, body);
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: BASE ? 'include' : 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', 'Tidak dapat terhubung ke server');
  }
  const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? 'Terjadi kesalahan');
  }
  return data as T;
}
