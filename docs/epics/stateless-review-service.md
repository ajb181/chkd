# Epic: Stateless Review Service

> Lightweight standalone service for UI review. Takes URL + wireframe + scope, screenshots the page, compares with Claude API, returns feedback, then dies. No persistent state, no memory leaks, no orphaned processes. Claude calls it and waits for response.

**Tag:** `stateless-review-service`
**Status:** Planning
**Created:** 2026-01-23

## Scope

- Playwright headless browser for screenshots
- Claude API for visual comparison/analysis
- HTTP endpoint for requests
- Clean process exit after response
- MCP tool for Claude to invoke it

## Out of Scope

- TBC

## Overhaul Checklist

- [ ] All linked items complete
- [ ] End-to-end tested
- [ ] Integration verified
- [ ] Documentation updated
- [ ] User sign-off

---

*Link items to this epic with: `chkd_tag("ITEM.ID", ["stateless-review-service"])`*
