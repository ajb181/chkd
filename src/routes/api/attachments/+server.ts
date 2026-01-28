import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs/promises';
import path from 'path';

const ATTACHMENTS_DIR = 'docs/attachments';

// Ensure attachments directory exists
async function ensureAttachmentsDir(repoPath: string): Promise<string> {
  const attachmentsPath = path.join(repoPath, ATTACHMENTS_DIR);
  await fs.mkdir(attachmentsPath, { recursive: true });
  return attachmentsPath;
}

// Generate attachment filename: {itemType}-{itemId}-{timestamp}-{originalName}
function generateFilename(itemType: string, itemId: string, originalName: string): string {
  const timestamp = Date.now();
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${itemType}-${itemId}-${timestamp}-${safeName}`;
}

// GET /api/attachments - List attachments for an item
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');
    const itemType = url.searchParams.get('itemType'); // 'bug', 'story', 'item'
    const itemId = url.searchParams.get('itemId');

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const attachmentsPath = path.join(repoPath, ATTACHMENTS_DIR);

    try {
      const files = await fs.readdir(attachmentsPath);

      // Filter by item if specified
      let filtered = files;
      if (itemType && itemId) {
        const prefix = `${itemType}-${itemId}-`;
        filtered = files.filter(f => f.startsWith(prefix));
      }

      // Get file info
      const attachments = await Promise.all(
        filtered.map(async (filename) => {
          const filePath = path.join(attachmentsPath, filename);
          const stats = await fs.stat(filePath);

          // Parse filename to extract metadata
          const parts = filename.split('-');
          const type = parts[0];
          const id = parts[1];
          const originalName = parts.slice(3).join('-'); // Everything after timestamp

          return {
            filename,
            originalName,
            itemType: type,
            itemId: id,
            size: stats.size,
            createdAt: stats.birthtime.toISOString(),
            path: path.join(ATTACHMENTS_DIR, filename)
          };
        })
      );

      return json({
        success: true,
        data: attachments
      });
    } catch (e) {
      // Directory doesn't exist yet - no attachments
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return json({ success: true, data: [] });
      }
      throw e;
    }
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// POST /api/attachments - Attach a file (from filepath)
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, itemType, itemId, filePath, description } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!itemType || !itemId) {
      return json({
        success: false,
        error: 'itemType and itemId are required',
        hint: 'itemType: "bug", "story", or "item". itemId: the item identifier'
      }, { status: 400 });
    }

    if (!filePath) {
      return json({
        success: false,
        error: 'filePath is required',
        hint: 'Provide absolute path to the file to attach'
      }, { status: 400 });
    }

    // Check source file exists
    try {
      await fs.access(filePath);
    } catch {
      return json({
        success: false,
        error: `File not found: ${filePath}`,
        hint: 'Provide an absolute path to an existing file'
      }, { status: 400 });
    }

    // Get file stats and name
    const stats = await fs.stat(filePath);
    const originalName = path.basename(filePath);

    // Ensure attachments directory exists
    const attachmentsPath = await ensureAttachmentsDir(repoPath);

    // Generate new filename
    const newFilename = generateFilename(itemType, itemId, originalName);
    const destPath = path.join(attachmentsPath, newFilename);

    // Copy file to attachments
    await fs.copyFile(filePath, destPath);

    return json({
      success: true,
      data: {
        filename: newFilename,
        originalName,
        itemType,
        itemId,
        size: stats.size,
        path: path.join(ATTACHMENTS_DIR, newFilename),
        message: `Attached ${originalName} to ${itemType} ${itemId}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// DELETE /api/attachments - Remove an attachment
export const DELETE: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, filename } = body;

    if (!repoPath || !filename) {
      return json({
        success: false,
        error: 'repoPath and filename are required'
      }, { status: 400 });
    }

    // Security: ensure filename doesn't contain path traversal
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return json({
        success: false,
        error: 'Invalid filename'
      }, { status: 400 });
    }

    const filePath = path.join(repoPath, ATTACHMENTS_DIR, filename);

    try {
      await fs.unlink(filePath);
      return json({
        success: true,
        data: {
          filename,
          message: `Deleted attachment: ${filename}`
        }
      });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return json({
          success: false,
          error: `Attachment not found: ${filename}`
        }, { status: 404 });
      }
      throw e;
    }
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
