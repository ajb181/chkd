import { readFile } from 'fs/promises';
import { join } from 'path';

export async function load() {
  const docsDir = join(process.cwd(), 'docs');

  // All documentation files for search indexing
  const docFiles = [
    { id: 'guide', name: 'Guide', file: 'GUIDE.md' },
    { id: 'cli', name: 'CLI Reference', file: 'CLI.md' },
    { id: 'sync', name: 'Sync System', file: 'SYNC.md' },
    { id: 'product', name: 'Product Knowledge', file: 'PRODUCT-KNOWLEDGE.md' },
  ];

  const docs: Record<string, string> = {};

  for (const doc of docFiles) {
    try {
      const content = await readFile(join(docsDir, doc.file), 'utf-8');
      docs[doc.id] = content;
    } catch {
      docs[doc.id] = `*Could not load ${doc.file}*`;
    }
  }

  return {
    docs,
    docFiles
  };
}
