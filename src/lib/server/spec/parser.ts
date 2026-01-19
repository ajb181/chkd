import fs from 'fs/promises';

export interface SpecItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  children: SpecItem[];
  line: number;
  story?: string;
}

export interface SpecPhase {
  name: string;
  number: number;
  status: 'complete' | 'in-progress' | 'pending';
  items: SpecItem[];
  line: number;
  story?: string;
  description?: string;
}

export interface ParsedSpec {
  title: string;
  phases: SpecPhase[];
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
    phasesFound: number;
    totalItems: number;
    completedItems: number;
    progress: number;
    emptyPhases: number[];
  };
}

export class SpecParser {
  async parseFile(specPath: string): Promise<ParsedSpec> {
    const content = await fs.readFile(specPath, 'utf-8');
    return this.parse(content);
  }

  parse(content: string): ParsedSpec {
    const lines = content.split('\n');
    const phases: SpecPhase[] = [];
    let title = '';
    let currentPhase: SpecPhase | null = null;
    let itemStack: SpecItem[] = [];
    let indentStack: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Extract title (first # heading)
      if (!title && line.startsWith('# ')) {
        title = line.slice(2).trim();
        continue;
      }

      // Detect phase headers: ### Phase N: Name emoji
      const phaseMatch = line.match(/^###\s+(?:Phase|Story)\s+(\d+):\s+(.+?)(\s+[✅🚧📋✓])?$/);
      const storyMatch = !phaseMatch && line.match(/^###\s+Story:\s+(.+?)(\s+[✅✓])?$/);

      if (phaseMatch || storyMatch) {
        if (currentPhase) {
          phases.push(currentPhase);
        }

        let phaseNum: number;
        let phaseName: string;
        let emoji: string | undefined;

        if (phaseMatch) {
          phaseNum = parseInt(phaseMatch[1], 10);
          phaseName = phaseMatch[2].trim();
          emoji = phaseMatch[3]?.trim();
        } else if (storyMatch) {
          phaseNum = -(phases.length + 100);
          phaseName = storyMatch[1].trim();
          emoji = storyMatch[2]?.trim();
        } else {
          continue;
        }

        let status: 'complete' | 'in-progress' | 'pending' = 'pending';
        if (emoji === '✅' || emoji === '✓') status = 'complete';
        else if (emoji === '🚧') status = 'in-progress';

        currentPhase = {
          name: phaseName,
          number: phaseNum,
          status,
          items: [],
          line: lineNum,
        };
        itemStack = [];
        indentStack = [];

        // Look ahead to capture content before first checklist item
        const storyLines: string[] = [];
        const descriptionLines: string[] = [];
        let lookAhead = i + 1;
        let inBlockquote = false;

        while (lookAhead < lines.length) {
          const nextLine = lines[lookAhead];

          if (nextLine.match(/^###\s+(?:Phase|Story)/)) break;
          if (nextLine.match(/^\s*-\s+\[[ xX]\]/)) break;

          if (nextLine.startsWith('>')) {
            storyLines.push(nextLine.slice(1).trim());
            inBlockquote = true;
          } else if (inBlockquote && nextLine.trim() === '') {
            inBlockquote = false;
          } else if (!inBlockquote) {
            descriptionLines.push(nextLine);
          }

          lookAhead++;
        }

        if (storyLines.length > 0) {
          currentPhase.story = storyLines.join(' ');
        }
        if (descriptionLines.length > 0) {
          while (descriptionLines.length > 0 && descriptionLines[0].trim() === '') {
            descriptionLines.shift();
          }
          while (descriptionLines.length > 0 && descriptionLines[descriptionLines.length - 1].trim() === '') {
            descriptionLines.pop();
          }
          if (descriptionLines.length > 0) {
            currentPhase.description = descriptionLines.join('\n');
          }
        }

        continue;
      }

      // Detect checklist items
      const itemMatch = line.match(/^(\s*)-\s+\[([ xX])\]\s+(.+)$/);
      const checkMatch = !itemMatch && line.match(/^(\s*)-\s+✓\s+(.+)$/);

      if ((itemMatch || checkMatch) && currentPhase) {
        const indent = itemMatch ? itemMatch[1].length : (checkMatch ? checkMatch[1].length : 0);
        const completed = itemMatch ? itemMatch[2].toLowerCase() === 'x' : true;
        const text = itemMatch ? itemMatch[3] : (checkMatch ? checkMatch[2] : '');

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

        const item: SpecItem = {
          id: this.generateId(currentPhase.number, itemTitle),
          title: itemTitle,
          description: itemDesc,
          completed,
          children: [],
          line: lineNum,
        };

        while (indentStack.length > 0 && indent <= indentStack[indentStack.length - 1]) {
          indentStack.pop();
          itemStack.pop();
        }

        if (itemStack.length === 0) {
          // Look ahead for user story blockquote
          const storyLines: string[] = [];
          let lookAhead = i + 1;

          while (lookAhead < lines.length && lines[lookAhead].trim() === '') {
            lookAhead++;
          }

          while (lookAhead < lines.length) {
            const nextLine = lines[lookAhead];
            if (nextLine.match(/^\s*-\s+\[[ xX]\]/) || nextLine.match(/^###\s+(?:Phase|Story)/)) {
              break;
            }
            const blockquoteMatch = nextLine.match(/^\s*>\s*(.*)$/);
            if (blockquoteMatch) {
              storyLines.push(blockquoteMatch[1].trim());
              lookAhead++;
            } else if (storyLines.length > 0) {
              break;
            } else {
              lookAhead++;
            }
          }

          if (storyLines.length > 0) {
            item.story = storyLines.join(' ');
          }

          currentPhase.items.push(item);
        } else {
          itemStack[itemStack.length - 1].children.push(item);
        }

        itemStack.push(item);
        indentStack.push(indent);
      }
    }

    if (currentPhase) {
      phases.push(currentPhase);
    }

    const { total, completed } = this.countItems(phases);

    return {
      title,
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
          item.description.toLowerCase().includes(lowerQuery)
        ) {
          results.push(item);
        }
        searchInItems(item.children);
      }
    };

    for (const phase of spec.phases) {
      searchInItems(phase.items);
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

    for (const phase of spec.phases) {
      collectIncomplete(phase.items);
    }

    return results;
  }

  getPhaseItems(spec: ParsedSpec, phaseNumber: number): SpecItem[] {
    const phase = spec.phases.find((p) => p.number === phaseNumber);
    return phase?.items || [];
  }

  validate(content: string): SpecValidationResult {
    const issues: SpecIssue[] = [];
    const lines = content.split('\n');
    const phaseNumbers: number[] = [];
    let lastPhaseNumber = 0;
    let currentPhaseLine = 0;
    let currentPhaseHasItems = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      const decimalMatch = line.match(/^###\s+Phase\s+(\d+\.\d+):/);
      if (decimalMatch) {
        issues.push({
          type: 'error',
          line: lineNum,
          message: `Decimal phase number "${decimalMatch[1]}" - parser only supports integers`,
          suggestion: `Change to "### Phase ${Math.floor(parseFloat(decimalMatch[1]))}: ..."`,
        });
      }

      const phaseMatch = line.match(/^###\s+(?:Phase|Story)\s+(\d+):\s+(.+?)(\s+[✅🚧📋✓])?$/);
      if (phaseMatch) {
        if (currentPhaseLine > 0 && !currentPhaseHasItems) {
          issues.push({
            type: 'error',
            line: currentPhaseLine,
            message: `Phase has no checklist items - it won't appear in the UI`,
            suggestion: 'Add items using "- [ ] **Feature** - Description" format',
          });
        }

        const phaseNum = parseInt(phaseMatch[1], 10);
        phaseNumbers.push(phaseNum);

        if (phaseNum !== lastPhaseNumber + 1 && lastPhaseNumber > 0) {
          issues.push({
            type: 'warning',
            line: lineNum,
            message: `Phase ${phaseNum} follows Phase ${lastPhaseNumber} - gap in numbering`,
            suggestion: `Consider renumbering to Phase ${lastPhaseNumber + 1}`,
          });
        }

        const duplicates = phaseNumbers.filter(n => n === phaseNum);
        if (duplicates.length > 1) {
          issues.push({
            type: 'error',
            line: lineNum,
            message: `Duplicate Phase ${phaseNum}`,
            suggestion: 'Each phase must have a unique number',
          });
        }

        lastPhaseNumber = phaseNum;
        currentPhaseLine = lineNum;
        currentPhaseHasItems = false;
      }

      if (line.match(/^\s*-\s+\[[ xX]\]/)) {
        currentPhaseHasItems = true;
      }

      if (line.match(/^####\s+/) && currentPhaseLine > 0) {
        issues.push({
          type: 'warning',
          line: lineNum,
          message: '#### headers are ignored by parser',
          suggestion: 'Use checklist items instead, or move content to description',
        });
      }
    }

    if (currentPhaseLine > 0 && !currentPhaseHasItems) {
      issues.push({
        type: 'error',
        line: currentPhaseLine,
        message: `Phase has no checklist items - it won't appear in the UI`,
        suggestion: 'Add items using "- [ ] **Feature** - Description" format',
      });
    }

    const parsed = this.parse(content);

    return {
      valid: issues.filter(i => i.type === 'error').length === 0,
      issues,
      summary: {
        phasesFound: parsed.phases.length,
        totalItems: parsed.totalItems,
        completedItems: parsed.completedItems,
        progress: parsed.progress,
        emptyPhases: parsed.phases.filter(p => p.items.length === 0).map(p => p.number),
      },
    };
  }

  private generateId(phaseNum: number, title: string): string {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `phase${phaseNum}-${slug}`;
  }

  private countItems(phases: SpecPhase[]): { total: number; completed: number } {
    let total = 0;
    let completed = 0;

    const countInItems = (items: SpecItem[]) => {
      for (const item of items) {
        total++;
        if (item.completed) completed++;
        countInItems(item.children);
      }
    };

    for (const phase of phases) {
      countInItems(phase.items);
    }

    return { total, completed };
  }
}
