// Merakit hasil build pratinjau menjadi satu fragmen HTML (CSS + JS ter-inline) untuk dihosting statis.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../dist-demo/', import.meta.url).pathname;
const files = readdirSync(dir);
const read = (ext) => {
  const name = files.find((f) => f.endsWith(ext));
  if (!name) throw new Error(`Tidak ada berkas ${ext} di ${dir}`);
  return readFileSync(join(dir, name), 'utf8');
};

const css = read('.css').replaceAll('</style', '<\\/style');
const js = read('.js').replaceAll('</script', '<\\/script').replaceAll('<!--', '<\\!--');

const html = `<title>CCP Video</title>
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
writeFileSync(join(dir, 'preview.html'), html);
console.log(`preview.html: ${(html.length / 1024).toFixed(0)} KB`);
