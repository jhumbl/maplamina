// Builds the widget script in inst/htmlwidgets from srcjs, with deck.gl and MapLibre
// bundled from node_modules. MapLibre's stylesheet and the licences of the bundled
// packages are written beside it.
import { build } from 'esbuild';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const outfile = 'inst/htmlwidgets/maplamina.js';

const result = await build({
  absWorkingDir: root,
  entryPoints: ['srcjs/index.ts'],
  outfile,
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  logLevel: 'info',
  metafile: true
});

copyFileSync(
  path.join(root, 'node_modules/maplibre-gl/dist/maplibre-gl.css'),
  path.join(root, 'inst/htmlwidgets/lib/maplibre-gl/maplibre-gl.css')
);

// One entry per package with code in the bundle, by folder under node_modules.
const LICENCE_FILES = ['LICENSE', 'LICENSE.txt', 'LICENSE.md'];
const packageDirs = new Set();
for (const [input, { bytesInOutput }] of Object.entries(result.metafile.outputs[outfile].inputs)) {
  const match = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input);
  if (match && bytesInOutput > 0) packageDirs.add(match[1]);
}

const notices = Array.from(packageDirs, (dir) => {
  const { name, version, license } = JSON.parse(readFileSync(path.join(root, dir, 'package.json'), 'utf8'));
  const file = LICENCE_FILES.find((f) => existsSync(path.join(root, dir, f)));
  if (!file) throw new Error(`No licence file found for '${name}' in ${dir}`);
  const text = readFileSync(path.join(root, dir, file), 'utf8').replace(/\r\n/g, '\n').trim();
  return { name, version, license, text };
}).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

writeFileSync(
  path.join(root, 'inst/htmlwidgets/third-party-licenses.txt'),
  'maplamina.js bundles the packages below. Each is listed with its version, its licence\n' +
    'and the licence text it is distributed under.\n' +
    notices.map((n) => `\n${'-'.repeat(72)}\n${n.name} ${n.version} (${n.license})\n\n${n.text}\n`).join('')
);
