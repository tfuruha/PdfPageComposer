import {cpSync, existsSync, readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig, type Plugin} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';

const currentDir = dirname(fileURLToPath(import.meta.url));
const pdfjsDir = resolve(currentDir, 'node_modules/pdfjs-dist');

/**
 * Serves PDF.js CMap (.bcmap) and standard font files during `vite dev` and copies them
 * into `dist/` during `vite build` so Japanese / CJK CIDFonts render accurately.
 */
function copyPdfjsAssetsPlugin(): Plugin {
  return {
    name: 'copy-pdfjs-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (url.startsWith('/cmaps/') || url.startsWith('/standard_fonts/')) {
          const filePath = resolve(pdfjsDir, url.slice(1));
          if (existsSync(filePath)) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.end(readFileSync(filePath));
            return;
          }
        }
        next();
      });
    },
    writeBundle(options) {
      const outDir = options.dir ?? resolve(currentDir, 'dist');

      for (const folder of ['cmaps', 'standard_fonts']) {
        const src = resolve(pdfjsDir, folder);
        const dest = resolve(outDir, folder);
        if (existsSync(src)) {
          cpSync(src, dest, {recursive: true, force: true});
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [svelte(), copyPdfjsAssetsPlugin()],
  build: {
    target: 'esnext',
  },
});
