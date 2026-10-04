// Membundel API menjadi JavaScript biasa (dist/server.js, dist/seed.js) agar production tidak butuh tsx.
// @ccp/shared (workspace, TypeScript) ikut dibundel; dependensi npm lain tetap eksternal dan dipasang lewat npm ci.
import { build } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = [...Object.keys(pkg.dependencies ?? {}).filter((d) => d !== '@ccp/shared'), '@electric-sql/pglite'];

rmSync(new URL('./dist', import.meta.url), { recursive: true, force: true });
await build({
  entryPoints: { server: 'src/server.ts', seed: 'src/seed.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external,
  // Modul ESM yang membutuhkan require() (mis. dependensi CommonJS) tetap berjalan.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
