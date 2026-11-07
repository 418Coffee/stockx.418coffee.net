import { defineConfig } from 'vite';
import { securityHeaders } from './security-headers.js';

export default defineConfig({
  preview: { headers: securityHeaders },
  plugins: [{
    name: 'static-security-headers',
    generateBundle() {
      this.emitFile({
        type: 'asset', fileName: '_headers',
        source: '/*\n' + Object.entries(securityHeaders).map(([name,value]) => `  ${name}: ${value}`).join('\n') + '\n',
      });
    },
  }],
});
