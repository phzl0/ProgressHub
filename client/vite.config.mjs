import { defineConfig, loadEnv, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const sourceRoot = fileURLToPath(new URL('./src/', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'REACT_APP_');
  const publicSettings = {
    'process.env.REACT_APP_PROD': JSON.stringify(env.REACT_APP_PROD || ''),
    'process.env.REACT_APP_GOOGLE_CLIENT_ID': JSON.stringify(env.REACT_APP_GOOGLE_CLIENT_ID || '')
  };
  return {
    plugins: [
      // Existing components use JSX in .js files; preserve their paths/imports.
      {
        name: 'progress-hub-jsx',
        enforce: 'pre',
        async transform(code, id) {
          if (!id.split('?')[0].startsWith(sourceRoot) || !id.split('?')[0].endsWith('.js')) return null;
          return transformWithEsbuild(code, id, { loader: 'jsx', jsx: 'automatic', define: publicSettings });
        }
      },
      react()
    ],
    // Only these existing public settings are exposed, never the server env.
    define: publicSettings,
    optimizeDeps: { esbuildOptions: { loader: { '.js': 'jsx' } } },
    build: { outDir: 'build' },
    server: { port: 3000, strictPort: true },
    preview: { port: 3000, strictPort: true }
  };
});
