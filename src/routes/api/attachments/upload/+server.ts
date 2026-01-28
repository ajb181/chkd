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

// Generate attachment filename
function generateFilename(itemType: string, itemId: string, originalName: string): string {
  const timestamp = Date.now();
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${itemType}-${itemId}-${timestamp}-${safeName}`;
}

// POST /api/attachments/upload - Upload a file via multipart form data
export const POST: RequestHandler = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const repoPath = formData.get('repoPath') as string | null;
    const itemType = formData.get('itemType') as string | null;
    const itemId = formData.get('itemId') as string | null;

    if (!file) {
      return json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!itemType || !itemId) {
      return json({
        success: false,
        error: 'itemType and itemId are required'
      }, { status: 400 });
    }

    // Ensure attachments directory exists
    const attachmentsPath = await ensureAttachmentsDir(repoPath);

    // Generate new filename
    const originalName = file.name;
    const newFilename = generateFilename(itemType, itemId, originalName);
    const destPath = path.join(attachmentsPath, newFilename);

    // Write file
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(destPath, buffer);

    return json({
      success: true,
      data: {
        filename: newFilename,
        originalName,
        itemType,
        itemId,
        size: file.size,
        path: path.join(ATTACHMENTS_DIR, newFilename),
        message: `Attached ${originalName} to ${itemType} ${itemId}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
