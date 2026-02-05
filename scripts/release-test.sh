#!/bin/bash
# CHKD Release Test Suite - Comprehensive
# Run before any release to catch bugs

PORT=${1:-3848}
BASE="http://localhost:$PORT"
REPO="/Users/alex/strateo"
REPO_ID="74151f2e-6a99-4484-b3a1-e7ca942d72af"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

test_api() {
  local name="$1"
  local method="$2"
  local endpoint="$3"
  local data="$4"
  local expect="$5"

  if [ "$method" = "GET" ]; then
    RESP=$(curl -s "$BASE$endpoint")
  else
    RESP=$(curl -s -X "$method" "$BASE$endpoint" -H "Content-Type: application/json" -d "$data")
  fi

  if echo "$RESP" | grep -q "$expect"; then
    echo -e "${GREEN}✓${NC} $name"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} $name"
    echo "  Expected: $expect"
    echo "  Got: $(echo "$RESP" | head -c 200)"
    ((FAIL++))
  fi
}

warn() {
  echo -e "${YELLOW}⚠${NC} $1"
  ((WARN++))
}

echo "═══════════════════════════════════════"
echo "CHKD Release Test - Port $PORT"
echo "═══════════════════════════════════════"
echo ""

# ═══════════════════════════════════════
# SERVER HEALTH
# ═══════════════════════════════════════
echo "── Server Health ──"
test_api "Server responds" "GET" "/api/spec/items?repoPath=$REPO" '"success":true'
test_api "Health endpoint" "GET" "/api/health" ""
test_api "Version endpoint" "GET" "/api/version" ""

# ═══════════════════════════════════════
# WORKING (in-progress)
# ═══════════════════════════════════════
echo ""
echo "── Working ──"
test_api "working() on valid parent" "POST" "/api/spec/in-progress" '{"repoPath":"'"$REPO"'","itemQuery":"SD.9"}' '"success":true'
test_api "working() on valid child" "POST" "/api/spec/in-progress" '{"repoPath":"'"$REPO"'","itemQuery":"SD.9.1"}' '"success":true'
test_api "working() by title" "POST" "/api/spec/in-progress" '{"repoPath":"'"$REPO"'","itemQuery":"Replace inline sheet"}' '"success":true'
test_api "working() invalid item fails" "POST" "/api/spec/in-progress" '{"repoPath":"'"$REPO"'","itemQuery":"FAKE.999"}' '"success":false'
test_api "working() missing repo fails" "POST" "/api/spec/in-progress" '{"itemQuery":"SD.9"}' '"success":false'
test_api "working() missing query fails" "POST" "/api/spec/in-progress" '{"repoPath":"'"$REPO"'"}' '"success":false'
test_api "working() empty query fails" "POST" "/api/spec/in-progress" '{"repoPath":"'"$REPO"'","itemQuery":""}' '"success":false'

# ═══════════════════════════════════════
# TICK
# ═══════════════════════════════════════
echo ""
echo "── Tick ──"

# Find an open item for testing
OPEN=$(sqlite3 ~/.chkd/chkd.db "SELECT display_id FROM spec_items WHERE repo_id='$REPO_ID' AND status='open' AND parent_id IS NOT NULL LIMIT 1")
if [ -n "$OPEN" ]; then
  # Test tick after working
  curl -s -X POST "$BASE/api/spec/in-progress" -H "Content-Type: application/json" -d '{"repoPath":"'"$REPO"'","itemQuery":"'"$OPEN"'"}' > /dev/null
  sleep 3
  test_api "tick() after working" "POST" "/api/spec/tick" '{"repoPath":"'"$REPO"'","itemQuery":"'"$OPEN"'"}' '"success":true'
  # Restore
  sqlite3 ~/.chkd/chkd.db "UPDATE spec_items SET status='open' WHERE display_id='$OPEN' AND repo_id='$REPO_ID'"

  # Test debounce
  curl -s -X POST "$BASE/api/spec/in-progress" -H "Content-Type: application/json" -d '{"repoPath":"'"$REPO"'","itemQuery":"'"$OPEN"'"}' > /dev/null
  test_api "tick() debounce blocks rapid tick" "POST" "/api/spec/tick" '{"repoPath":"'"$REPO"'","itemQuery":"'"$OPEN"'"}' 'Too fast'
else
  warn "No open item to test tick"
fi

test_api "tick() invalid item fails" "POST" "/api/spec/tick" '{"repoPath":"'"$REPO"'","itemQuery":"FAKE.999"}' '"success":false'
test_api "tick() missing repo fails" "POST" "/api/spec/tick" '{"itemQuery":"SD.9"}' '"success":false'

# Find done item
DONE=$(sqlite3 ~/.chkd/chkd.db "SELECT display_id FROM spec_items WHERE repo_id='$REPO_ID' AND status='done' LIMIT 1")
if [ -n "$DONE" ]; then
  test_api "tick() already done fails" "POST" "/api/spec/tick" '{"repoPath":"'"$REPO"'","itemQuery":"'"$DONE"'"}' 'Already complete'
fi

# ═══════════════════════════════════════
# ADD CHILD (with gap handling)
# ═══════════════════════════════════════
echo ""
echo "── Add Child ──"

PARENT="SD.9"
PARENT_ID=$(sqlite3 ~/.chkd/chkd.db "SELECT id FROM spec_items WHERE display_id='$PARENT' AND repo_id='$REPO_ID'")
MAX_CHILD=$(sqlite3 ~/.chkd/chkd.db "SELECT MAX(CAST(SUBSTR(display_id, LENGTH('$PARENT.') + 1) AS INTEGER)) FROM spec_items WHERE parent_id='$PARENT_ID'")

test_api "add_child() creates item" "POST" "/api/spec/add-child" '{"repoPath":"'"$REPO"'","parentId":"'"$PARENT"'","title":"Test child item"}' '"success":true'

# Verify correct ID
EXPECTED_ID="$PARENT.$((MAX_CHILD + 1))"
CREATED=$(sqlite3 ~/.chkd/chkd.db "SELECT display_id FROM spec_items WHERE title='Test child item' AND repo_id='$REPO_ID'")
if [ "$CREATED" = "$EXPECTED_ID" ]; then
  echo -e "${GREEN}✓${NC} add_child() handles gaps - created $EXPECTED_ID"
  ((PASS++))
else
  echo -e "${RED}✗${NC} add_child() ID wrong - expected $EXPECTED_ID, got $CREATED"
  ((FAIL++))
fi

# Clean up
sqlite3 ~/.chkd/chkd.db "DELETE FROM spec_items WHERE title='Test child item' AND repo_id='$REPO_ID'"

test_api "add_child() missing parent fails" "POST" "/api/spec/add-child" '{"repoPath":"'"$REPO"'","parentId":"FAKE.999","title":"Test"}' '"success":false'
test_api "add_child() missing title fails" "POST" "/api/spec/add-child" '{"repoPath":"'"$REPO"'","parentId":"'"$PARENT"'"}' '"success":false'
test_api "add_child() empty title fails" "POST" "/api/spec/add-child" '{"repoPath":"'"$REPO"'","parentId":"'"$PARENT"'","title":""}' '"success":false'

# ═══════════════════════════════════════
# ADD (new feature)
# ═══════════════════════════════════════
echo ""
echo "── Add ──"

TEST_TITLE="ReleaseTest$(date +%s)"
test_api "add() creates FUT item" "POST" "/api/spec/add" '{"repoPath":"'"$REPO"'","title":"'"$TEST_TITLE"'","areaCode":"FUT","keyRequirements":["Test"],"filesToChange":["test.ts"],"testing":["Manual"]}' '"success":true'

# Verify children created
CHILD_COUNT=$(sqlite3 ~/.chkd/chkd.db "SELECT COUNT(*) FROM spec_items WHERE title LIKE '%ReleaseTest%' OR display_id LIKE 'FUT.%.%'")
if [ "$CHILD_COUNT" -gt 1 ]; then
  echo -e "${GREEN}✓${NC} add() creates children (found $CHILD_COUNT items)"
  ((PASS++))
else
  echo -e "${RED}✗${NC} add() didn't create children"
  ((FAIL++))
fi

# Clean up
CREATED_ID=$(sqlite3 ~/.chkd/chkd.db "SELECT display_id FROM spec_items WHERE title LIKE '%ReleaseTest%' AND parent_id IS NULL LIMIT 1")
if [ -n "$CREATED_ID" ]; then
  sqlite3 ~/.chkd/chkd.db "DELETE FROM spec_items WHERE display_id LIKE '${CREATED_ID}%'"
fi

test_api "add() missing title fails" "POST" "/api/spec/add" '{"repoPath":"'"$REPO"'","areaCode":"FUT"}' '"success":false'
test_api "add() missing areaCode fails" "POST" "/api/spec/add" '{"repoPath":"'"$REPO"'","title":"Test"}' '"success":false'

# Test different area codes
for AREA in SD FE BE; do
  TEST_TITLE2="AreaTest$(date +%s)$AREA"
  RESP=$(curl -s -X POST "$BASE/api/spec/add" -H "Content-Type: application/json" -d '{"repoPath":"'"$REPO"'","title":"'"$TEST_TITLE2"'","areaCode":"'"$AREA"'","keyRequirements":["Test"],"filesToChange":["test.ts"],"testing":["Manual"]}')
  if echo "$RESP" | grep -q '"success":true'; then
    echo -e "${GREEN}✓${NC} add() with areaCode=$AREA"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} add() with areaCode=$AREA failed"
    ((FAIL++))
  fi
  # Clean up
  CREATED_ID=$(sqlite3 ~/.chkd/chkd.db "SELECT display_id FROM spec_items WHERE title LIKE '%AreaTest%' AND parent_id IS NULL ORDER BY created_at DESC LIMIT 1")
  if [ -n "$CREATED_ID" ]; then
    sqlite3 ~/.chkd/chkd.db "DELETE FROM spec_items WHERE display_id LIKE '${CREATED_ID}%'"
  fi
done

# ═══════════════════════════════════════
# DELETE
# ═══════════════════════════════════════
echo ""
echo "── Delete ──"

# Create item to delete
curl -s -X POST "$BASE/api/spec/add-child" -H "Content-Type: application/json" -d '{"repoPath":"'"$REPO"'","parentId":"SD.9","title":"ToDelete"}' > /dev/null
DELETE_ID=$(sqlite3 ~/.chkd/chkd.db "SELECT display_id FROM spec_items WHERE title='ToDelete' AND repo_id='$REPO_ID'")

test_api "delete() removes item" "POST" "/api/spec/delete" '{"repoPath":"'"$REPO"'","itemId":"'"$DELETE_ID"'"}' '"success":true'

# Verify deleted
STILL_EXISTS=$(sqlite3 ~/.chkd/chkd.db "SELECT COUNT(*) FROM spec_items WHERE title='ToDelete' AND repo_id='$REPO_ID'")
if [ "$STILL_EXISTS" = "0" ]; then
  echo -e "${GREEN}✓${NC} delete() actually removes from DB"
  ((PASS++))
else
  echo -e "${RED}✗${NC} delete() didn't remove from DB"
  ((FAIL++))
fi

test_api "delete() missing itemId fails" "POST" "/api/spec/delete" '{"repoPath":"'"$REPO"'"}' '"success":false'

# ═══════════════════════════════════════
# STATUS & SESSION
# ═══════════════════════════════════════
echo ""
echo "── Status & Session ──"

test_api "status() returns data" "GET" "/api/status?repoPath=$REPO" '"success":true'
test_api "session() returns data" "GET" "/api/session?repoPath=$REPO" '"success":true'

# Verify session has expected fields
RESP=$(curl -s "$BASE/api/session?repoPath=$REPO")
if echo "$RESP" | grep -q '"status"'; then
  echo -e "${GREEN}✓${NC} session has status field"
  ((PASS++))
else
  echo -e "${RED}✗${NC} session missing status field"
  ((FAIL++))
fi

# ═══════════════════════════════════════
# ITEMS QUERY
# ═══════════════════════════════════════
echo ""
echo "── Items Query ──"

test_api "items() returns list" "GET" "/api/spec/items?repoPath=$REPO" '"success":true'
test_api "items() with query" "GET" "/api/spec/items?repoPath=$REPO&query=SD.9" '"success":true'
test_api "items() with area filter" "GET" "/api/spec/items?repoPath=$REPO&area=SD" '"success":true'
test_api "items() topLevel only" "GET" "/api/spec/items?repoPath=$REPO&topLevel=true" '"success":true'

# ═══════════════════════════════════════
# TAGS
# ═══════════════════════════════════════
echo ""
echo "── Tags ──"

# Get an item to tag
TAG_ITEM=$(sqlite3 ~/.chkd/chkd.db "SELECT display_id FROM spec_items WHERE repo_id='$REPO_ID' AND parent_id IS NULL LIMIT 1")
if [ -n "$TAG_ITEM" ]; then
  test_api "tags() set tags" "POST" "/api/spec/tags" '{"repoPath":"'"$REPO"'","itemId":"'"$TAG_ITEM"'","tags":["test-tag","another"]}' '"success":true'
  test_api "tags() get tags" "GET" "/api/spec/tags?repoPath=$REPO&itemId=$TAG_ITEM" '"success":true'
  # Clean up
  curl -s -X POST "$BASE/api/spec/tags" -H "Content-Type: application/json" -d '{"repoPath":"'"$REPO"'","itemId":"'"$TAG_ITEM"'","tags":[]}' > /dev/null
fi

# ═══════════════════════════════════════
# ERROR HANDLING
# ═══════════════════════════════════════
echo ""
echo "── Error Handling ──"

# No TypeErrors
RESP=$(curl -s -X POST "$BASE/api/spec/tick" -H "Content-Type: application/json" -d '{"repoPath":"'"$REPO"'","itemQuery":"anything"}')
if echo "$RESP" | grep -q "TypeError"; then
  echo -e "${RED}✗${NC} TypeError in tick response"
  ((FAIL++))
else
  echo -e "${GREEN}✓${NC} No TypeError in tick"
  ((PASS++))
fi

RESP=$(curl -s -X POST "$BASE/api/spec/in-progress" -H "Content-Type: application/json" -d '{"repoPath":"'"$REPO"'","itemQuery":"anything"}')
if echo "$RESP" | grep -q "TypeError"; then
  echo -e "${RED}✗${NC} TypeError in working response"
  ((FAIL++))
else
  echo -e "${GREEN}✓${NC} No TypeError in working"
  ((PASS++))
fi

RESP=$(curl -s -X POST "$BASE/api/spec/add-child" -H "Content-Type: application/json" -d '{"repoPath":"'"$REPO"'","parentId":"FAKE","title":"test"}')
if echo "$RESP" | grep -q "TypeError"; then
  echo -e "${RED}✗${NC} TypeError in add-child response"
  ((FAIL++))
else
  echo -e "${GREEN}✓${NC} No TypeError in add-child"
  ((PASS++))
fi

# ═══════════════════════════════════════
# INVALID REPO
# ═══════════════════════════════════════
echo ""
echo "── Invalid Repo ──"

test_api "items() invalid repo fails gracefully" "GET" "/api/spec/items?repoPath=/fake/path" '"success":false'
test_api "working() invalid repo fails gracefully" "POST" "/api/spec/in-progress" '{"repoPath":"/fake/path","itemQuery":"test"}' '"success":false'

# ═══════════════════════════════════════
# DB INTEGRITY
# ═══════════════════════════════════════
echo ""
echo "── DB Integrity ──"

# Check for duplicate display_ids within same repo
DUPES=$(sqlite3 ~/.chkd/chkd.db "SELECT COUNT(*) FROM (SELECT repo_id, display_id, COUNT(*) as cnt FROM spec_items GROUP BY repo_id, display_id HAVING cnt > 1)")
if [ "$DUPES" = "0" ]; then
  echo -e "${GREEN}✓${NC} No duplicate display_ids"
  ((PASS++))
else
  echo -e "${RED}✗${NC} Found $DUPES duplicate display_ids"
  ((FAIL++))
fi

# Check for orphan children
ORPHANS=$(sqlite3 ~/.chkd/chkd.db "SELECT COUNT(*) FROM spec_items s WHERE s.parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM spec_items p WHERE p.id = s.parent_id)")
if [ "$ORPHANS" = "0" ]; then
  echo -e "${GREEN}✓${NC} No orphan children"
  ((PASS++))
else
  echo -e "${RED}✗${NC} Found $ORPHANS orphan children"
  ((FAIL++))
fi

# Check for NULL display_ids
NULL_IDS=$(sqlite3 ~/.chkd/chkd.db "SELECT COUNT(*) FROM spec_items WHERE display_id IS NULL OR display_id = ''")
if [ "$NULL_IDS" = "0" ]; then
  echo -e "${GREEN}✓${NC} No NULL display_ids"
  ((PASS++))
else
  echo -e "${RED}✗${NC} Found $NULL_IDS NULL display_ids"
  ((FAIL++))
fi

# ═══════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════
echo ""
echo "═══════════════════════════════════════"
echo -e "PASSED:   ${GREEN}$PASS${NC}"
echo -e "FAILED:   ${RED}$FAIL${NC}"
echo -e "WARNINGS: ${YELLOW}$WARN${NC}"
echo "═══════════════════════════════════════"

if [ $FAIL -gt 0 ]; then
  echo -e "${RED}RELEASE TEST FAILED${NC}"
  exit 1
else
  echo -e "${GREEN}RELEASE TEST PASSED${NC}"
  exit 0
fi
