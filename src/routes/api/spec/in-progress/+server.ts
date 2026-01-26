import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { markItemInProgress } from '$lib/server/spec/writer';
import { SpecParser } from '$lib/server/spec/parser';
import { getRepoByPath, getSession, updateSession, setAnchor } from '$lib/server/db/queries';
import path from 'path';

// POST /api/spec/in-progress - Mark item as in-progress
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, itemQuery } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!itemQuery) {
      return json({ success: false, error: 'itemQuery is required' }, { status: 400 });
    }

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');

    // Find the item to get its ID and title
    const parser = new SpecParser();
    const spec = await parser.parseFile(specPath);

    let foundItem: { id: string; title: string; isParent: boolean } | null = null;
    const queryLower = itemQuery.toLowerCase();

    // Get current task ID to scope sub-item search FIRST
    const repo = getRepoByPath(repoPath);
    let scopeToParentId: string | undefined;
    let currentParent: any = null;
    if (repo) {
      const session = getSession(repo.id);
      if (session.currentTask?.id) {
        scopeToParentId = session.currentTask.id;
        // Find the parent item
        for (const area of spec.areas) {
          for (const item of area.items) {
            if (item.id === scopeToParentId) {
              currentParent = item;
              break;
            }
          }
          if (currentParent) break;
        }
      }
    }

    // Check for area code match (BE.23, SD.1)
    const areaMatch = itemQuery.match(/^([A-Z]{2,3})\.(\d+)$/i);

    // FIRST: If we have a current parent, search its children first
    if (currentParent && currentParent.children && !areaMatch) {
      const searchChildren = (children: any[]): { id: string; title: string } | null => {
        for (const child of children) {
          if (child.title.toLowerCase().includes(queryLower)) {
            return { id: child.id, title: child.title };
          }
          if (child.children) {
            const found = searchChildren(child.children);
            if (found) return found;
          }
        }
        return null;
      };
      const childMatch = searchChildren(currentParent.children);
      if (childMatch) {
        foundItem = { ...childMatch, isParent: false };
      }
    }

    // SECOND: Search globally if no scoped match
    if (!foundItem) {
      for (const area of spec.areas) {
        if (areaMatch) {
          const areaCode = areaMatch[1].toUpperCase();
          const itemNum = areaMatch[2];
          const sectionCode = `${areaCode}.${itemNum}`;
          // Search for item with matching section code in title
          for (const item of area.items) {
            if (item.title.startsWith(`${sectionCode} `)) {
              foundItem = { id: item.id, title: item.title, isParent: true };
              break;
            }
          }
          if (foundItem) break;
        } else {
          // Search by title
          for (const item of area.items) {
            if (item.title.toLowerCase().includes(queryLower)) {
              foundItem = { id: item.id, title: item.title, isParent: true };
              break;
            }
            // Check children
            for (const child of item.children || []) {
              if (child.title.toLowerCase().includes(queryLower)) {
                foundItem = { id: child.id, title: child.title, isParent: false };
                break;
              }
            }
            if (foundItem) break;
          }
        }
        if (foundItem) break;
      }
    }

    await markItemInProgress(specPath, itemQuery, scopeToParentId);

    // Update session with current task info so tick can find children
    if (repo && foundItem) {
      // If it's a parent item, set it as the current task and anchor
      if (foundItem.isParent) {
        updateSession(repo.id, {
          currentTask: { id: foundItem.id, title: foundItem.title, phase: null },
          status: 'building'
        });
        setAnchor(repo.id, foundItem.id, foundItem.title, 'cli');
      } else {
        // If it's a child, just set current item (parent should already be set)
        updateSession(repo.id, {
          currentItem: { id: foundItem.id, title: foundItem.title }
        });
      }
    }

    return json({
      success: true,
      data: {
        itemQuery,
        itemId: foundItem?.id,
        itemTitle: foundItem?.title,
        status: 'in-progress',
        message: `In progress: ${itemQuery}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
