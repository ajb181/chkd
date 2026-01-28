# Code Quality Tools Research

A simple guide to checking code health before and after tasks.

---

## The Problem We're Solving

When you start a task, you might be about to build on top of messy code. It would be nice to know that *before* you start, so you can choose to clean it up first.

When you finish a task, you might have introduced some messiness. It would be nice to catch that and log it as future refactoring work.

**Goal:** Simple quality checks that fit our workflow. Team of one + AI.

---

## What "Code Quality" Actually Means

Here's what the tools check for, in plain English:

| Term | What It Means | Why It Matters |
|------|---------------|----------------|
| **Complexity** | How many paths through the code (if/else, loops, etc.) | Hard to read = hard to change |
| **Duplication** | Copy-pasted code | Fix a bug in one place, miss the copies |
| **Long functions** | Functions doing too much | Should be split into smaller pieces |
| **Magic numbers** | Random numbers like `if (x > 42)` | What does 42 mean? Use a named constant |
| **Dead code** | Code that's never used | Confusing clutter |
| **Coupling** | Everything depends on everything | Change one thing, break ten others |

---

## The Tools (Simplest to Most Complex)

### 1. jscpd - Copy/Paste Detector

**What it does:** Finds duplicated code blocks.

**How to run:**
```bash
npx jscpd ./src --min-lines 5
```

**Output:** Shows you where code is copy-pasted:
```
Found 3 clones with 120 duplicated lines in 15 files
```

**Effort:** Zero config. Just run it.

**Good for:** Quick check before/after tasks.

---

### 2. Knip - Dead Code Finder

**What it does:** Finds unused files, exports, and dependencies.

**How to run:**
```bash
npx knip
```

**Output:** Lists what's not being used:
```
Unused files: src/old-utils.ts
Unused exports: formatDate in src/utils.ts
Unused dependencies: lodash
```

**Effort:** Zero config for basic use.

**Good for:** Cleaning up cruft. Run occasionally.

---

### 3. ESLint Rules (Specific Checks)

**What it does:** Catches specific patterns you define as "bad."

**Useful rules for us:**
- `max-lines-per-function` - Flag long functions
- `no-magic-numbers` - Flag unexplained numbers
- `complexity` - Flag complex functions

**How to run:** (after setup)
```bash
npx eslint src/ --rule 'complexity: ["warn", 10]'
```

**Effort:** Medium - needs a config file.

**Good for:** Ongoing enforcement. Set up once, runs forever.

---

### 4. Code Health Meter - Full Dashboard

**What it does:** Comprehensive health report with scores.

**How to run:**
```bash
npx code-health-meter --srcDir ./src --outputDir ./report --format html
```

**Output:** HTML report with:
- Maintainability score
- Complexity per file
- Duplication percentage
- Coupling analysis
- Visual graphs

**Effort:** Zero config. But slower, more output to digest.

**Good for:** Periodic deep-dive. Not every task.

---

## How This Fits Our Workflow

### Before Starting a Task (Explore Phase)

```
┌─────────────────────────────────────────────┐
│  You: /chkd SD.5                            │
│                                             │
│  Claude: Starting Explore phase...          │
│          Let me check the files we'll touch │
│                                             │
│  [Runs: npx jscpd src/routes/api/]          │
│                                             │
│  Claude: Found 45 duplicated lines in       │
│          api/session.ts and api/task.ts     │
│                                             │
│          Want to refactor first, or         │
│          proceed and log it for later?      │
│                                             │
│  You: Log it, let's proceed                 │
│                                             │
│  [chkd bug "Duplication in session/task"]   │
└─────────────────────────────────────────────┘
```

**The key:** You decide. Claude flags, doesn't force.

---

### After Finishing a Task

```
┌─────────────────────────────────────────────┐
│  You: Done with the feature                 │
│                                             │
│  Claude: Nice! Quick quality check...       │
│                                             │
│  [Runs: npx jscpd src/routes/api/]          │
│                                             │
│  Claude: New duplication detected:          │
│          handleError() duplicated 3 times   │
│                                             │
│          Want me to refactor now, or        │
│          log it as a quick win?             │
│                                             │
│  You: Log it                                │
│                                             │
│  [chkd win "Extract shared handleError()"]  │
└─────────────────────────────────────────────┘
```

---

## My Recommendation

### Start Simple (Week 1)

Just use **jscpd** manually when you want a quick check:

```bash
npx jscpd ./src --min-lines 5
```

That's it. No setup. Run it when you're curious.

---

### Add to Workflow (Week 2+)

Create a simple npm script:

```json
{
  "scripts": {
    "health": "npx jscpd ./src --min-lines 5 && npx knip"
  }
}
```

Then just:
```bash
npm run health
```

---

### Optional: Add to /code-health Skill

A skill that Claude runs during Explore phase:

1. Check files that will be touched
2. Run jscpd on those files
3. Report findings
4. Let user decide: proceed or refactor first

**Not a gate.** Not blocking. Just information.

---

## What NOT To Do

- **Don't add SonarQube** - Overkill for team of one
- **Don't add 10 ESLint plugins** - Noise, not signal
- **Don't make it a gate** - You decide, not the tool
- **Don't run full reports every task** - Too slow, too much info

---

## Integration Points in chkd

| When | What to Check | Tool | Action |
|------|---------------|------|--------|
| Explore phase | Files we'll touch | jscpd | Flag duplication, let user decide |
| After Implement | New code we wrote | jscpd | Catch new duplication |
| Weekly/Monthly | Whole codebase | knip + code-health-meter | Deep clean |

---

## The Commands You Need

```bash
# Quick duplication check
npx jscpd ./src --min-lines 5

# Find dead code
npx knip

# Full health report (occasional)
npx code-health-meter --srcDir ./src --outputDir ./report --format html

# Check specific complexity (needs eslint)
npx eslint src/ --rule 'complexity: ["warn", 10]'
```

---

## Summary

| Tool | What | When | Effort |
|------|------|------|--------|
| **jscpd** | Duplication | Every task | Zero |
| **knip** | Dead code | Weekly | Zero |
| **code-health-meter** | Full report | Monthly | Zero |
| **eslint rules** | Specific patterns | Always on | Medium setup |

**Start with jscpd.** It's the highest value for lowest effort. One command, immediate insight.

---

## Sources

- [jscpd - Copy/Paste Detector](https://github.com/kucherenko/jscpd)
- [Knip - Dead Code Finder](https://knip.dev)
- [Code Health Meter](https://github.com/helabenkhalfallah/code-health-meter)
- [ESLint Custom Rules](https://eslint.org/docs/latest/extend/custom-rules)
