#!/usr/bin/env node
/**
 * Build MCP server for stable distribution
 *
 * Bundles src/mcp/server-http.ts and all local dependencies into a single file
 * that can be run without tsx or TypeScript compilation.
 */

import * as esbuild from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

async function build() {
  const outfile = resolve(rootDir, 'build-stable/mcp/server-http.js');

  // Ensure output directory exists
  const outDir = dirname(outfile);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  await esbuild.build({
    entryPoints: [resolve(rootDir, 'src/mcp/server-http.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile,

    // Keep external - these are npm packages that will be installed
    external: [
      '@modelcontextprotocol/sdk',
      'zod',
    ],

    // Resolve $lib alias to src/lib
    alias: {
      '$lib': resolve(rootDir, 'src/lib'),
    },

    // Add banner with shebang for direct execution
    banner: {
      js: '#!/usr/bin/env node',
    },
  });

  // Make executable
  fs.chmodSync(outfile, '755');

  console.log(`Built MCP server: ${outfile}`);
}

build().catch((err) => {
  console.error('MCP build failed:', err);
  process.exit(1);
});
