import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function riotVerificationAsset(): Plugin {
  return {
    name: 'riot-verification-asset',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'riot.txt', source: readFileSync('riot.txt') });
    },
  };
}

export default defineConfig({
  base: '/HUH/',
  plugins: [react(), riotVerificationAsset()],
  optimizeDeps: { noDiscovery: true, include: [] },
});
