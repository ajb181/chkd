# Research: Documentation Best Practices

> Research for SD.22 - World-Class User Guide

---

## Key Principles from Industry Leaders

### 1. Information Architecture

**Core principle:** Organize by user mental models, not internal structure.

- **Progressive disclosure**: Getting Started → Daily Use → Advanced → Reference
- **Role-based entry points**: Let users self-select their experience level
- **Predictable sections**: "Getting Started", "API Reference", "Troubleshooting"
- **Consistent naming**: Clear, predictable names for categories and URLs

### 2. User-Centered Design

- Start with user research (who are the users?)
- Create distinct paths for different user journeys
- Don't overwhelm newcomers while still providing depth for experts
- Card sorting: Group topics how users expect, not how devs think

### 3. Content Structure

- **Topic-based authoring**: Modular, self-contained chunks
- **Reusable content**: Write once, use in multiple contexts
- **Definition of Done**: Documentation is part of shipping features

---

## Gold Standard Examples

### Stripe Documentation
- Industry benchmark for API docs
- Interactive examples you can run
- Clear navigation by use case
- Code samples in multiple languages
- "Copy to clipboard" everywhere

### Tailwind CSS Docs
- Beautiful, searchable, fast
- Built with their own Syntax template (Next.js + Markdoc)
- Visual examples alongside code
- Progressive complexity

### Vercel Docs
- Clean, minimal, developer-focused
- Dark theme support
- Task-oriented structure
- Integrates with their product seamlessly

---

## Search Options

### Option 1: Algolia DocSearch (Recommended for public docs)
- **Free** for open source/public documentation
- Industry standard, used by Vue, React, Tailwind
- Requires "Search by Algolia" attribution
- Understands code snippets, markdown, tables
- [docsearch.algolia.com](https://docsearch.algolia.com/)

### Option 2: Typesense (Self-hosted alternative)
- Open source Algolia alternative
- Has DocSearch-compatible scraper
- Can self-host or use cloud
- [typesense.org](https://typesense.org)

### Option 3: Lunr (Local/client-side)
- No external service needed
- Works for private/non-public sites
- Index downloaded to browser
- Good for smaller docs
- Used by MkDocs

### Option 4: VitePress/Docusaurus built-in
- Framework-specific solutions
- Local search for small sites
- Algolia integration for larger sites

**Recommendation for chkd:** Start with Lunr (local search) since:
- Works offline
- No external dependency
- Fast for our doc size
- Can upgrade to Algolia later if needed

---

## 2026 Trends

1. **AI-powered search**: Semantic search, not just keyword matching
2. **Zero UI/Voice**: Content structured for conversational access
3. **Personalization**: Docs adapt to user's skill level
4. **Structured data**: Better machine readability (JSON-LD, etc.)

---

## User Journey Mapping for chkd

### Level 1: New User (0-30 minutes)
**Goal**: Get chkd running and understand the concept
- What is chkd?
- 5-minute quick start
- First task completion
- Basic concepts (spec, sessions, anchors)

### Level 2: Active User (Daily use)
**Goal**: Productive daily workflow
- CLI reference
- UI features
- Spec management
- Bug tracking
- Settings customization

### Level 3: Power User (Advanced)
**Goal**: Maximum productivity
- Multi-worker system
- MCP tools deep dive
- Custom workflows
- Integration patterns

### Level 4: Team Lead (SaaS/Enterprise)
**Goal**: Team deployment and management
- SaaS setup
- Team configuration
- Permissions and roles
- Analytics and reporting

---

## Recommended Guide Structure

```
/guide
├── Getting Started
│   ├── What is chkd?
│   ├── Quick Start (5 min)
│   ├── Core Concepts
│   └── Your First Task
│
├── Daily Workflow
│   ├── Using the UI
│   ├── CLI Commands
│   ├── Managing Specs
│   ├── Tracking Bugs
│   └── Settings
│
├── Advanced Features
│   ├── Multi-Worker System
│   ├── MCP Tools Reference
│   ├── Custom Skills
│   └── Integration Patterns
│
├── Team & SaaS
│   ├── SaaS Setup
│   ├── Team Management
│   ├── Enterprise Features
│   └── Analytics
│
├── Reference
│   ├── CLI Reference (full)
│   ├── MCP Tools Reference (full)
│   ├── API Reference
│   └── Configuration
│
└── Troubleshooting
    ├── Common Issues
    ├── FAQ
    └── Getting Help
```

---

## Implementation Notes

### Tech Stack Options

1. **Current approach** (Markdown + SvelteKit)
   - Keep /guide route
   - Add client-side search (Lunr/Flexsearch)
   - Parse markdown at build time
   - Pros: No new dependencies, integrated
   - Cons: Need to build search ourselves

2. **Dedicated docs site** (VitePress/Docusaurus)
   - Separate docs.chkd.dev site
   - Built-in search, versioning
   - Pros: Best-in-class docs UX
   - Cons: Separate deployment, context switching

3. **Hybrid** (Recommended)
   - Keep quick reference in-app at /guide
   - Full docs in dedicated site
   - Link between them seamlessly

**Recommendation**: Option 1 for MVP (enhance current /guide), migrate to Option 3 when SaaS launches.

---

## Sources

- [10 Essential Technical Documentation Best Practices for 2026](https://www.documind.chat/blog/technical-documentation-best-practices)
- [Information Architecture Best Practices - Docsie](https://www.docsie.io/blog/glossary/information-architecture/)
- [Stripe Developer Experience Teardown - Moesif](https://www.moesif.com/blog/best-practices/api-product-management/the-stripe-developer-experience-and-docs-teardown/)
- [DocSearch by Algolia](https://docsearch.algolia.com/)
- [VitePress Search Reference](https://vitepress.dev/reference/default-theme-search)
- [Typesense - Open Source Search](https://typesense.org)
