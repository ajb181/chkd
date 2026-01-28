# Guide Structure Design

> Information architecture for the World-Class User Guide (SD.22)

---

## Design Principles

1. **Progressive disclosure** - Start simple, reveal complexity as needed
2. **Task-oriented** - Organized by what users want to DO, not features
3. **Searchable** - Every section findable by common search terms
4. **Skimmable** - Headers, summaries, code blocks for quick scanning
5. **Copy-paste ready** - All code examples work as-is

---

## URL Structure

```
/guide                    # Landing with overview
/guide/quickstart         # 5-minute setup
/guide/concepts           # Core concepts explained
/guide/workflow           # Daily workflow
/guide/cli                # CLI reference
/guide/mcp                # MCP tools reference
/guide/multiworker        # Multi-worker system
/guide/saas               # Team/SaaS setup
/guide/troubleshooting    # Common issues
/guide/faq                # Frequently asked questions
```

---

## Page Structure

### Landing Page (`/guide`)

```
┌─────────────────────────────────────────────────────────────────┐
│  chkd Guide                                    🔍 Search        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Keep Claude on-plan. Track what gets built.                   │
│                                                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐      │
│  │ 🚀 Quick Start│  │ 📖 Concepts   │  │ 💻 CLI Ref   │      │
│  │ 5 min setup   │  │ How it works  │  │ All commands │      │
│  └───────────────┘  └───────────────┘  └───────────────┘      │
│                                                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐      │
│  │ 🔧 MCP Tools  │  │ 👥 Multi-Worker│ │ ☁️ SaaS Setup│      │
│  │ For Claude    │  │ Parallel work │  │ Team features│      │
│  └───────────────┘  └───────────────┘  └───────────────┘      │
│                                                                 │
│  Popular:                                                       │
│  • How do I add a feature?                                     │
│  • How do I fix a bug?                                         │
│  • What MCP tools are available?                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Content Outline

### 1. Quick Start (`/guide/quickstart`)

**Time to complete**: 5 minutes
**Goal**: Get chkd running with first task completed

```markdown
# Quick Start

Get chkd running in 5 minutes.

## Prerequisites
- Node.js 18+
- Git
- Claude Code (or claude.ai with MCP)

## Step 1: Install chkd (1 min)
[code block]

## Step 2: Start the server (30 sec)
[code block]

## Step 3: Configure Claude MCP (1 min)
[code block with config]

## Step 4: Add chkd to your project (1 min)
[code block]

## Step 5: Build your first feature (2 min)
[code block showing /chkd SD.1]

## Next Steps
- Read Core Concepts to understand how chkd works
- Check the CLI Reference for all commands
```

### 2. Core Concepts (`/guide/concepts`)

**Goal**: Understand how chkd works

```markdown
# Core Concepts

Understanding the key ideas behind chkd.

## The Spec File
Your single source of truth...

## Sessions
Track what you're working on...

## The 6-Phase Workflow
Every feature follows this pattern...
[Visual diagram]

## Anchors
Stay focused on what matters...

## Bugs vs Quick Wins
When to use each...
```

### 3. Daily Workflow (`/guide/workflow`)

**Goal**: Productive daily development

```markdown
# Daily Workflow

How to use chkd day-to-day.

## Starting Your Day
1. Check status: `chkd status`
2. Pick a task or continue where you left off
3. Use `/chkd SD.1` to start building

## Adding Features
[Step by step with examples]

## Tracking Progress
[How to tick items, track time]

## Handling Interruptions
[Bugs, quick wins, context switching]

## End of Day
[Committing, cleaning up]
```

### 4. CLI Reference (`/guide/cli`)

**Goal**: Complete command reference

```markdown
# CLI Reference

Complete reference for all chkd commands.

## Quick Reference
[Table of all commands]

## Session Commands
### chkd status
[Full documentation]

### chkd working
[Full documentation]
...

## Spec Commands
...

## Bug Commands
...
```

### 5. MCP Tools Reference (`/guide/mcp`)

**Goal**: Complete MCP tools reference

```markdown
# MCP Tools Reference

All MCP tools available to Claude.

## Core Tools
### chkd_status
[Description, parameters, examples]

### chkd_working
[Description, parameters, examples]
...

## Session Tools
...

## Bug Tools
...

## Multi-Worker Tools
...

## Manager Tools
...
```

### 6. Multi-Worker System (`/guide/multiworker`)

**Goal**: Understand and use parallel workers

```markdown
# Multi-Worker System

Run parallel Claude workers for faster development.

## Overview
How the multi-worker system works...

## When to Use Workers
[Decision guide]

## Spawning a Worker
[Step by step]

## Worker Communication
[Heartbeat, status, signals]

## Merging Changes
[Auto-merge vs conflicts]

## Conflict Resolution
[How to handle conflicts]

## Manager Role
[Research, review, document tools]
```

### 7. Team/SaaS Setup (`/guide/saas`)

**Goal**: Set up chkd for teams

```markdown
# Team & SaaS Setup

Set up chkd for your team.

## Overview
What the SaaS version provides...

## Creating a Team
[Step by step]

## Adding Team Members
[Invitations, roles]

## Permissions
[What each role can do]

## GitHub Integration
[Connecting repos]

## Analytics
[What metrics are tracked]

## Billing
[Plans, usage, invoices]
```

### 8. Troubleshooting (`/guide/troubleshooting`)

**Goal**: Solve common problems

```markdown
# Troubleshooting

Solutions for common issues.

## Installation Issues
### "chkd: command not found"
[Solution]

### "Cannot connect to chkd"
[Solution]

## MCP Issues
### Tools not showing up
[Solution]

### "Server outdated" warning
[Solution]

## Spec Issues
### "Task not found"
[Solution]

### Spec format broken
[Solution]

## Session Issues
### Session stuck
[Solution]

### Off-track warnings
[Solution]
```

### 9. FAQ (`/guide/faq`)

**Goal**: Quick answers to common questions

```markdown
# FAQ

Frequently asked questions.

## General
### What is chkd?
### Why not just use GitHub Issues?
### Does chkd work with other AI assistants?

## Installation
### What are the requirements?
### Does it work on Windows?

## Usage
### How do I add a feature?
### How do I track bugs?
### What's the difference between bugs and quick wins?

## Multi-Worker
### How many workers can I run?
### What happens if workers conflict?

## SaaS
### Is there a free tier?
### How is usage billed?
```

---

## Search Implementation

### Approach: Client-Side with Flexsearch

**Why Flexsearch over Lunr:**
- Faster (3x-10x)
- Better memory efficiency
- Supports fuzzy matching
- Active maintenance

### Index Structure

```typescript
interface SearchDocument {
  id: string;          // URL path
  title: string;       // Page/section title
  content: string;     // Text content (stripped of markdown)
  section: string;     // Parent section
  keywords: string[];  // Additional search terms
}
```

### Search UI

```
┌─────────────────────────────────────────────────────┐
│ 🔍 Search the guide...                    ⌘K       │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 📄 Quick Start                                      │
│    Get chkd running in 5 minutes                   │
│                                                     │
│ 📄 chkd_status                                     │
│    Get current project status...                   │
│                                                     │
│ 📄 Troubleshooting > MCP Issues                    │
│    Tools not showing up in Claude...               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Keyboard Shortcuts

- `⌘K` / `Ctrl+K` - Open search
- `↑↓` - Navigate results
- `Enter` - Go to result
- `Esc` - Close search

---

## Navigation Design

### Sidebar (Desktop)

```
┌──────────────────────┐
│ 📖 Guide             │
├──────────────────────┤
│ Getting Started      │
│   Quick Start        │
│   Core Concepts      │
│                      │
│ Daily Use            │
│   Workflow           │
│   CLI Reference      │
│   MCP Tools          │
│                      │
│ Advanced             │
│   Multi-Worker       │
│   Custom Skills      │
│                      │
│ Team                 │
│   SaaS Setup         │
│   Permissions        │
│                      │
│ Help                 │
│   Troubleshooting    │
│   FAQ                │
└──────────────────────┘
```

### Breadcrumbs

```
Guide > Advanced > Multi-Worker > Conflict Resolution
```

### Previous/Next Navigation

```
← Worker Communication    Conflict Resolution    Manager Role →
```

---

## Content Style Guide

### Headings
- H1: Page title only
- H2: Major sections
- H3: Sub-sections
- H4: Rarely used, for nested topics

### Code Blocks
- Always include language tag
- Keep examples short and runnable
- Include expected output where helpful

### Callouts

```markdown
> **Note**: Important information

> **Warning**: Something to watch out for

> **Tip**: Helpful suggestion
```

### Lists
- Use bullet points for unordered items
- Use numbers for sequential steps
- Keep items concise (1-2 lines)

---

## Implementation Plan

### Phase 1: Structure (This Design)
- [x] Information architecture
- [x] URL structure
- [x] Navigation design
- [x] Content outline

### Phase 2: Search System
- [ ] Install Flexsearch
- [ ] Create search index builder
- [ ] Build search UI component
- [ ] Add keyboard shortcuts

### Phase 3: Content Migration
- [ ] Convert existing GUIDE.md
- [ ] Write Quick Start
- [ ] Write Core Concepts
- [ ] Expand CLI Reference

### Phase 4: New Content
- [ ] Multi-Worker guide
- [ ] SaaS setup guide
- [ ] Troubleshooting expansion
- [ ] FAQ creation

### Phase 5: Polish
- [ ] Review all content
- [ ] Test search functionality
- [ ] Mobile responsiveness
- [ ] Performance optimization

---

## File Structure

```
src/routes/guide/
├── +page.svelte              # Landing page
├── +layout.svelte            # Shared layout with sidebar
├── quickstart/
│   └── +page.svelte
├── concepts/
│   └── +page.svelte
├── workflow/
│   └── +page.svelte
├── cli/
│   └── +page.svelte
├── mcp/
│   └── +page.svelte
├── multiworker/
│   └── +page.svelte
├── saas/
│   └── +page.svelte
├── troubleshooting/
│   └── +page.svelte
└── faq/
    └── +page.svelte

src/lib/components/guide/
├── GuideSearch.svelte        # Search component
├── GuideSidebar.svelte       # Navigation sidebar
├── GuideNav.svelte           # Prev/Next navigation
├── Callout.svelte            # Note/Warning/Tip boxes
└── CodeBlock.svelte          # Enhanced code blocks
```

---

## Success Metrics

1. **Time to First Success**: < 10 min from landing to first task completed
2. **Search Effectiveness**: > 90% of searches find relevant result in top 3
3. **Support Reduction**: Questions answered by docs without asking
4. **User Feedback**: Positive comments on documentation quality
