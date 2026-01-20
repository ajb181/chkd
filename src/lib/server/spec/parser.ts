import fs from 'fs/promises';

export type ItemStatus = 'open' | 'in-progress' | 'done' | 'skipped';
export type Priority = 1 | 2 | 3 | null;  // P1=High, P2=Medium, P3=Low, null=Backlog

export interface SpecItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;  // backward compat: true if done
  status: ItemStatus;
  priority: Priority;  // null = backlog (untagged)
  children: SpecItem[];
  line: number;
  story?: string;
}

export interface SpecArea {
  name: string;
  code: string;  // SD, FE, BE, FUT, REF
  status: 'complete' | 'in-progress' | 'pending';
  items: SpecItem[];
  line: number;
  story?: string;
  description?: string;
}

// Keep SpecPhase as alias for backward compatibility
export type SpecPhase = SpecArea & { number: number };

export interface ParsedSpec {
  title: string;
  areas: SpecArea[];
  phases: SpecPhase[];  // Backward compat - same as areas with number added
  totalItems: number;
  completedItems: number;
  progress: number;
}

export interface SpecIssue {
  type: 'error' | 'warning';
  line: number;
  message: string;
  suggestion?: string;
}

export interface SpecValidationResult {
  valid: boolean;
  issues: SpecIssue[];
  summary: {
    areasFound: number;
    phasesFound: number;  // Backward compat
    totalItems: number;
    completedItems: number;
    progress: number;
    emptyAreas: string[];
    emptyPhases: number[];  // Backward compat
  };
}

// Map area names to codes
const AREA_CODES: Record<string, string> = {
  'site design': 'SD',
  'frontend': 'FE',
  'backend': 'BE',
  'future areas': 'FUT',
  'future': 'FUT',
  'reference': 'REF',
  'skills': 'SKL',
  'overview': 'OV',
};

export class SpecParser {
  async parseFile(specPath: string): Promise<ParsedSpec> {
    const content = await fs.readFile(specPath, 'utf-8');
    return this.parse(content);
  }

  parse(content: string): ParsedSpec {
    const lines = content.split('\n');
    const areas: SpecArea[] = [];
    let title = '';
    let currentArea: SpecArea | null = null;
    let itemStack: SpecItem[] = [];
    let indentStack: number[] = [];
    let areaIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Extract title (first # heading)
      if (!title && line.startsWith('# ')) {
        title = line.slice(2).trim();
        continue;
      }

      // Detect Area headers: ## Area Name
      const areaMatch = line.match(/^##\s+([^#].+?)(\s+[✅🚧📋✓])?\s*$/);

      // Also support old Phase format: ### Phase N: Name
      const phaseMatch = !areaMatch && line.match(/^###\s+(?:Phase|Story)\s+(\d+):\s+(.+?)(\s+[✅🚧📋✓])?$/);

      if (areaMatch || phaseMatch) {
        // Save previous area
        if (currentArea) {
          this.computeAreaStatus(currentArea);
          areas.push(currentArea);
        }

        let areaName: string;
        let areaCode: string;
        let emoji: string | undefined;

        if (areaMatch) {
          areaName = areaMatch[1].trim();
          emoji = areaMatch[2]?.trim();
          // Get code from mapping or generate from name
          const lowerName = areaName.toLowerCase();
          areaCode = AREA_CODES[lowerName] || this.generateCode(areaName);
        } else if (phaseMatch) {
          // Old Phase format - use phase number as code
          areaName = phaseMatch[2].trim();
          emoji = phaseMatch[3]?.trim();
          areaCode = `P${phaseMatch[1]}`;
        } else {
          continue;
        }

        let status: 'complete' | 'in-progress' | 'pending' = 'pending';
        if (emoji === '✅' || emoji === '✓') status = 'complete';
        else if (emoji === '🚧') status = 'in-progress';

        currentArea = {
          name: areaName,
          code: areaCode,
          status,
          items: [],
          line: lineNum,
        };
        itemStack = [];
        indentStack = [];
        areaIndex++;

        // Look ahead to capture blockquote description
        const storyLines: string[] = [];
        let lookAhead = i + 1;

        while (lookAhead < lines.length) {
          const nextLine = lines[lookAhead];

          // Stop at next area/phase header or checklist item
          if (nextLine.match(/^##\s+[^#]/) || nextLine.match(/^###\s+(?:Phase|Story)/)) break;
          if (nextLine.match(/^\s*-\s+\[[ xX~\-]\]/)) break;

          if (nextLine.startsWith('>')) {
            storyLines.push(nextLine.slice(1).trim());
          }

          lookAhead++;
        }

        if (storyLines.length > 0) {
          currentArea.story = storyLines.join(' ');
        }

        continue;
      }

      // Detect checklist items: [ ] open, [x] done, [~] in-progress, [-] skipped
      const itemMatch = line.match(/^(\s*)-\s+\[([ xX~\-])\]\s+(.+)$/);
      const checkMatch = !itemMatch && line.match(/^(\s*)-\s+✓\s+(.+)$/);

      if ((itemMatch || checkMatch) && currentArea) {
        const indent = itemMatch ? itemMatch[1].length : (checkMatch ? checkMatch[1].length : 0);
        const marker = itemMatch ? itemMatch[2].toLowerCase() : 'x';
        const text = itemMatch ? itemMatch[3] : (checkMatch ? checkMatch[2] : '');

        // Determine status from marker
        let status: ItemStatus;
        let completed: boolean;
        switch (marker) {
          case 'x':
            status = 'done';
            completed = true;
            break;
          case '~':
            status = 'in-progress';
            completed = false;
            break;
          case '-':
            status = 'skipped';
            completed = false;
            break;
          default:
            status = 'open';
            completed = false;
        }

        // Parse **Title** - Description format
        const boldMatch = text.match(/^\*\*(.+?)\*\*\s*(?:-\s*)?(.*)$/);
        let itemTitle: string;
        let itemDesc: string;

        if (boldMatch) {
          itemTitle = boldMatch[1];
          itemDesc = boldMatch[2] || '';
        } else {
          itemTitle = text;
          itemDesc = '';
        }

        // Extract priority tag [P1], [P2], [P3] from title
        let priority: Priority = null;  // null = backlog
        const priorityMatch = itemTitle.match(/^\[P([123])\]\s*/i);
        if (priorityMatch) {
          priority = parseInt(priorityMatch[1], 10) as Priority;
          itemTitle = itemTitle.replace(/^\[P[123]\]\s*/i, '');  // Remove tag from display title
        }

        const item: SpecItem = {
          id: this.generateId(currentArea.code, itemTitle),
          title: itemTitle,
          description: itemDesc,
          completed,
          status,
          priority,
          children: [],
          line: lineNum,
        };

        // Handle nesting based on indent
        while (indentStack.length > 0 && indent <= indentStack[indentStack.length - 1]) {
          indentStack.pop();
          itemStack.pop();
        }

        if (itemStack.length === 0) {
          currentArea.items.push(item);
        } else {
          itemStack[itemStack.length - 1].children.push(item);
        }

        itemStack.push(item);
        indentStack.push(indent);
      }
    }

    // Don't forget the last area
    if (currentArea) {
      this.computeAreaStatus(currentArea);
      areas.push(currentArea);
    }

    const { total, completed } = this.countItems(areas);

    // Create phases array for backward compatibility
    const phases: SpecPhase[] = areas.map((area, idx) => ({
      ...area,
      number: idx + 1,
    }));

    return {
      title,
      areas,
      phases,
      totalItems: total,
      completedItems: completed,
      progress: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  findItems(spec: ParsedSpec, query: string): SpecItem[] {
    const results: SpecItem[] = [];
    const lowerQuery = query.toLowerCase();

    const searchInItems = (items: SpecItem[]) => {
      for (const item of items) {
        if (
          item.title.toLowerCase().includes(lowerQuery) ||
          item.description.toLowerCase().includes(lowerQuery) ||
          item.id.toLowerCase().includes(lowerQuery)
        ) {
          results.push(item);
        }
        searchInItems(item.children);
      }
    };

    for (const area of spec.areas) {
      searchInItems(area.items);
    }

    return results;
  }

  getIncompleteItems(spec: ParsedSpec): SpecItem[] {
    const results: SpecItem[] = [];

    const collectIncomplete = (items: SpecItem[]) => {
      for (const item of items) {
        if (!item.completed) {
          results.push(item);
        }
        collectIncomplete(item.children);
      }
    };

    for (const area of spec.areas) {
      collectIncomplete(area.items);
    }

    return results;
  }

  getAreaItems(spec: ParsedSpec, areaCode: string): SpecItem[] {
    const area = spec.areas.find((a) => a.code === areaCode);
    return area?.items || [];
  }

  // Backward compat
  getPhaseItems(spec: ParsedSpec, phaseNumber: number): SpecItem[] {
    const phase = spec.phases.find((p) => p.number === phaseNumber);
    return phase?.items || [];
  }

  validate(content: string): SpecValidationResult {
    const issues: SpecIssue[] = [];
    const lines = content.split('\n');
    const areaCodes: string[] = [];
    let currentAreaLine = 0;
    let currentAreaHasItems = false;
    let currentAreaCode = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Detect area headers
      const areaMatch = line.match(/^##\s+([^#].+?)(\s+[✅🚧📋✓])?\s*$/);
      const phaseMatch = !areaMatch && line.match(/^###\s+(?:Phase|Story)\s+(\d+):\s+(.+?)(\s+[✅🚧📋✓])?$/);

      if (areaMatch || phaseMatch) {
        // Check previous area had items
        if (currentAreaLine > 0 && !currentAreaHasItems) {
          issues.push({
            type: 'warning',
            line: currentAreaLine,
            message: `Area has no checklist items`,
            suggestion: 'Add items using "- [ ] **Feature** - Description" format',
          });
        }

        let areaCode: string;
        if (areaMatch) {
          const areaName = areaMatch[1].trim().toLowerCase();
          areaCode = AREA_CODES[areaName] || this.generateCode(areaMatch[1]);
        } else if (phaseMatch) {
          areaCode = `P${phaseMatch[1]}`;
        } else {
          continue;
        }

        // Check for duplicate area codes
        if (areaCodes.includes(areaCode)) {
          issues.push({
            type: 'warning',
            line: lineNum,
            message: `Duplicate area code "${areaCode}"`,
            suggestion: 'Each area should have a unique name/code',
          });
        }

        areaCodes.push(areaCode);
        currentAreaLine = lineNum;
        currentAreaHasItems = false;
        currentAreaCode = areaCode;
      }

      if (line.match(/^\s*-\s+\[[ xX]\]/)) {
        currentAreaHasItems = true;
      }
    }

    // Check last area
    if (currentAreaLine > 0 && !currentAreaHasItems) {
      issues.push({
        type: 'warning',
        line: currentAreaLine,
        message: `Area has no checklist items`,
        suggestion: 'Add items using "- [ ] **Feature** - Description" format',
      });
    }

    const parsed = this.parse(content);

    return {
      valid: issues.filter(i => i.type === 'error').length === 0,
      issues,
      summary: {
        areasFound: parsed.areas.length,
        phasesFound: parsed.phases.length,
        totalItems: parsed.totalItems,
        completedItems: parsed.completedItems,
        progress: parsed.progress,
        emptyAreas: parsed.areas.filter(a => a.items.length === 0).map(a => a.code),
        emptyPhases: parsed.phases.filter(p => p.items.length === 0).map(p => p.number),
      },
    };
  }

  private generateCode(name: string): string {
    // Generate 2-3 letter code from name
    const words = name.split(/\s+/);
    if (words.length === 1) {
      return words[0].slice(0, 3).toUpperCase();
    }
    return words.map(w => w[0]).join('').toUpperCase().slice(0, 3);
  }

  private generateId(areaCode: string, title: string): string {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `${areaCode.toLowerCase()}-${slug}`;
  }

  private computeAreaStatus(area: SpecArea): void {
    const allItems = this.getAllItems(area.items);
    if (allItems.length === 0) {
      area.status = 'pending';
      return;
    }

    const completedCount = allItems.filter(i => i.completed).length;
    if (completedCount === allItems.length) {
      area.status = 'complete';
    } else if (completedCount > 0) {
      area.status = 'in-progress';
    } else {
      area.status = 'pending';
    }
  }

  private getAllItems(items: SpecItem[]): SpecItem[] {
    const result: SpecItem[] = [];
    for (const item of items) {
      result.push(item);
      result.push(...this.getAllItems(item.children));
    }
    return result;
  }

  private countItems(areas: SpecArea[]): { total: number; completed: number } {
    let total = 0;
    let completed = 0;

    for (const area of areas) {
      const allItems = this.getAllItems(area.items);
      total += allItems.length;
      completed += allItems.filter(i => i.completed).length;
    }

    return { total, completed };
  }
}
