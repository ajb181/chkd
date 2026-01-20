import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SpecParser, type SpecItem, type SpecArea } from '$lib/server/spec/parser';
import path from 'path';

interface DuplicateMatch {
  item: {
    id: string;
    title: string;
    description: string;
    status: string;
  };
  area: {
    code: string;
    name: string;
  };
  similarity: number; // 0-1 score
  matchType: 'exact' | 'similar' | 'keyword';
}

// GET /api/spec/duplicates - Check for duplicate/similar features
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');
    const title = url.searchParams.get('title');

    if (!repoPath || !title) {
      return json({ success: false, error: 'repoPath and title are required' }, { status: 400 });
    }

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    const parser = new SpecParser();
    const spec = await parser.parseFile(specPath);

    const matches = findDuplicates(title, spec.areas);

    return json({
      success: true,
      data: {
        query: title,
        matches,
        hasDuplicates: matches.some(m => m.similarity >= 0.7)
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

function findDuplicates(query: string, areas: SpecArea[]): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  const queryLower = query.toLowerCase();
  const queryWords = extractKeywords(query);

  for (const area of areas) {
    checkItems(area.items, area, queryLower, queryWords, matches);
  }

  // Sort by similarity (highest first)
  matches.sort((a, b) => b.similarity - a.similarity);

  // Return top 5 matches above threshold
  return matches.filter(m => m.similarity >= 0.3).slice(0, 5);
}

function checkItems(
  items: SpecItem[],
  area: SpecArea,
  queryLower: string,
  queryWords: string[],
  matches: DuplicateMatch[]
): void {
  for (const item of items) {
    const titleLower = item.title.toLowerCase();
    const descLower = item.description.toLowerCase();

    let similarity = 0;
    let matchType: DuplicateMatch['matchType'] = 'keyword';

    // Check for exact match
    if (titleLower === queryLower) {
      similarity = 1.0;
      matchType = 'exact';
    }
    // Check for substring match
    else if (titleLower.includes(queryLower) || queryLower.includes(titleLower)) {
      similarity = 0.8;
      matchType = 'similar';
    }
    // Check for keyword overlap
    else {
      const itemWords = extractKeywords(item.title);
      const overlap = countOverlap(queryWords, itemWords);
      const maxPossible = Math.max(queryWords.length, itemWords.length);

      if (maxPossible > 0) {
        similarity = overlap / maxPossible;

        // Boost if description also matches
        if (item.description) {
          const descWords = extractKeywords(item.description);
          const descOverlap = countOverlap(queryWords, descWords);
          if (descOverlap > 0) {
            similarity = Math.min(1.0, similarity + 0.1);
          }
        }
      }

      if (similarity >= 0.5) {
        matchType = 'similar';
      }
    }

    if (similarity > 0.3) {
      matches.push({
        item: {
          id: item.id,
          title: item.title,
          description: item.description,
          status: item.status
        },
        area: {
          code: area.code,
          name: area.name
        },
        similarity,
        matchType
      });
    }

    // Check children
    checkItems(item.children, area, queryLower, queryWords, matches);
  }
}

function extractKeywords(text: string): string[] {
  // Common stop words to filter out
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
    'this', 'that', 'these', 'those', 'it', 'its', 'add', 'create',
    'build', 'make', 'implement', 'update', 'fix', 'change', 'new'
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

function countOverlap(words1: string[], words2: string[]): number {
  let count = 0;
  for (const w1 of words1) {
    for (const w2 of words2) {
      // Exact match
      if (w1 === w2) {
        count += 1;
      }
      // Partial match (one contains the other)
      else if (w1.includes(w2) || w2.includes(w1)) {
        count += 0.5;
      }
    }
  }
  return count;
}
