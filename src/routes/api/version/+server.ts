import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// GET /api/version - Get server version and MCP file hash
export const GET: RequestHandler = async () => {
  try {
    // Read package.json for semver
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const version = pkg.version || '0.0.0';

    // Hash the MCP server file for sync check
    const mcpPath = path.join(process.cwd(), 'src/mcp/server-http.ts');
    let mcpHash = 'unknown';
    
    try {
      const mcpContent = fs.readFileSync(mcpPath, 'utf-8');
      mcpHash = crypto.createHash('md5').update(mcpContent).digest('hex').slice(0, 8);
    } catch (err) {
      // File not found or can't read
    }

    return json({
      success: true,
      data: {
        version,
        mcpHash,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
