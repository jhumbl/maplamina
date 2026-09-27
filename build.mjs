// Builds the widget scripts in inst/htmlwidgets from srcjs.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// The page loads deck.gl and MapLibre from lib/ before the widget scripts, so an import of
// an engine package resolves to the global that build defines.
const ENGINE_GLOBALS = {
  '@deck.gl/core': 'deck',
  '@deck.gl/layers': 'deck',
  '@deck.gl/extensions': 'deck',
  '@deck.gl/mapbox': 'deck',
  'maplibre-gl': 'maplibregl'
};

const engineGlobals = {
  name: 'engine-globals',
  setup(build) {
    build.onResolve({ filter: /^(@deck\.gl\/|maplibre-gl$)/ }, (args) => {
      if (!(args.path in ENGINE_GLOBALS)) {
        return { errors: [{ text: `No page global is known for '${args.path}'` }] };
      }
      return { path: args.path, namespace: 'engine-global' };
    });
    build.onLoad({ filter: /.*/, namespace: 'engine-global' }, (args) => ({
      contents: `module.exports = ${ENGINE_GLOBALS[args.path]};`,
      loader: 'js'
    }));
  }
};

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
  logLevel: 'info',
  plugins: [engineGlobals]
});
