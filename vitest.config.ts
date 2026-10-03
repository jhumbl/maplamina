import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// deck.gl and luma.gl are imported by the modules under test. They go through Vite so
// that their bare import of wgsl_reflect resolves to its ES module build.
export default defineConfig({
  resolve: {
    alias: {
      wgsl_reflect: fileURLToPath(new URL('./node_modules/wgsl_reflect/wgsl_reflect.module.js', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    server: { deps: { inline: [/@deck\.gl/, /@luma\.gl/, /wgsl_reflect/] } },
  },
});
