// Builds the widget scripts in inst/htmlwidgets from srcjs.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

await build({
  absWorkingDir: fileURLToPath(new URL('.', import.meta.url)),
  entryPoints: {
    'maplamina-modules': 'srcjs/namespace.ts',
    maplamina: 'srcjs/index.ts'
  },
  outdir: 'inst/htmlwidgets',
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  logLevel: 'info'
});
