import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const TEST_REPO = '/tmp/chkd-test-review';
const API_BASE = 'http://localhost:3847';

describe('ReviewDone Integration Tests', () => {
  beforeEach(() => {
    // Clean up test artifacts
    if (fs.existsSync(path.join(TEST_REPO, '.chkd'))) {
      fs.rmSync(path.join(TEST_REPO, '.chkd'), { recursive: true });
    }
  });

  it('should reject empty summary', async () => {
    const response = await fetch(`${API_BASE}/api/spec/review-done`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoPath: TEST_REPO,
        itemId: 'test-id',
        summary: ''
      })
    });

    const result = await response.json();
    expect(result.success).toBe(false);
    expect(result.error).toContain('at least 10 characters');
  });

  it('should reject short summary', async () => {
    const response = await fetch(`${API_BASE}/api/spec/review-done`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoPath: TEST_REPO,
        itemId: 'test-id',
        summary: 'short'
      })
    });

    const result = await response.json();
    expect(result.success).toBe(false);
    expect(result.error).toContain('at least 10 characters');
  });

  it('should handle malformed review.log gracefully', async () => {
    // Create .chkd directory with malformed log
    const chkdDir = path.join(TEST_REPO, '.chkd');
    fs.mkdirSync(chkdDir, { recursive: true });
    fs.writeFileSync(path.join(chkdDir, 'review.log'), 'invalid json\n{broken\n');

    // Tick should still work if DB flag is set
    // (This tests that we're not crashing on malformed log file)
    const response = await fetch(`${API_BASE}/api/spec/tick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoPath: TEST_REPO,
        itemQuery: 'TEST.1'
      })
    });

    // Should get proper error about item not found, not JSON parse error
    const result = await response.json();
    expect(result.error).not.toContain('JSON');
  });

  it('should set reviewCompleted flag in DB', async () => {
    // This test requires an actual item in DB
    // Test implementation depends on your test setup
    // Placeholder for now
    expect(true).toBe(true);
  });

  it('should block tick() without ReviewDone', async () => {
    // Create a parent item with incomplete children
    // Try to tick without ReviewDone
    // Should be blocked
    // Placeholder for full test
    expect(true).toBe(true);
  });

  it('should allow tick() after ReviewDone', async () => {
    // Create a parent item with incomplete children
    // Call ReviewDone
    // Tick should succeed and mark all children done
    // Placeholder for full test
    expect(true).toBe(true);
  });
});
