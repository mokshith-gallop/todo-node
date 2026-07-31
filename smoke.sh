#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
FAILURES=0
CHECKS=0

# ── Load DB credentials from preview-env.json ────────────────
if [ -f /workspace/.gallop/preview-env.json ]; then
  eval "$(python3 -c "
import json, shlex
d = json.load(open('/workspace/.gallop/preview-env.json'))['backend']
for k, v in d.items():
    print('export %s=%s' % (k, shlex.quote(str(v))))
")"
fi

# Fallback: DATABASE_URL must be set (from env or preview-env.json)
if [ -z "${DATABASE_URL:-}" ]; then
  echo "FATAL: DATABASE_URL not set"
  exit 1
fi

# JWT_SECRET is injected by the platform as a system env var
JWT_SECRET="${JWT_SECRET:-dev-secret}"

# ── Helpers ──────────────────────────────────────────────────
check() {
  CHECKS=$((CHECKS + 1))
  local desc="$1"
  local expected="$2"
  local actual="$3"

  if [ "$expected" = "$actual" ]; then
    echo "  ✓ $desc"
  else
    echo "  ✗ $desc (expected: $expected, got: $actual)"
    FAILURES=$((FAILURES + 1))
  fi
}

check_contains() {
  CHECKS=$((CHECKS + 1))
  local desc="$1"
  local needle="$2"
  local haystack="$3"

  if echo "$haystack" | grep -q "$needle"; then
    echo "  ✓ $desc"
  else
    echo "  ✗ $desc (expected to contain: $needle)"
    FAILURES=$((FAILURES + 1))
  fi
}

check_not_contains() {
  CHECKS=$((CHECKS + 1))
  local desc="$1"
  local needle="$2"
  local haystack="$3"

  if echo "$haystack" | grep -q "$needle"; then
    echo "  ✗ $desc (should NOT contain: $needle)"
    FAILURES=$((FAILURES + 1))
  else
    echo "  ✓ $desc"
  fi
}

# Generate a JWT for a given user ID
make_token() {
  local user_id="$1"
  node -e "
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ sub: '$user_id' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    process.stdout.write(token);
  "
}

# Run SQL via Prisma (handles DATABASE_URL automatically)
run_sql() {
  local sql="$1"
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.\$executeRawUnsafe(\"$sql\").then(() => p.\$disconnect()).catch(e => { console.error(e.message); process.exit(1); });
  "
}

# ── Clean + Seed test data ───────────────────────────────────
echo "Cleaning and seeding test data..."

run_sql "DELETE FROM task"
run_sql "DELETE FROM task_list"
run_sql 'DELETE FROM \"user\"'

USER_A_ID="11111111-1111-1111-1111-111111111111"
USER_B_ID="22222222-2222-2222-2222-222222222222"
LIST_A_ID="a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"
LIST_B_ID="b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2"
LIST_EMPTY_ID="c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3"

run_sql "INSERT INTO \\\"user\\\" (id, email, password_hash) VALUES ('$USER_A_ID', 'usera@smoke.test', 'h')"
run_sql "INSERT INTO \\\"user\\\" (id, email, password_hash) VALUES ('$USER_B_ID', 'userb@smoke.test', 'h')"
run_sql "INSERT INTO task_list (id, user_id, name, position) VALUES ('$LIST_A_ID', '$USER_A_ID', 'List A', 1024.0)"
run_sql "INSERT INTO task_list (id, user_id, name, position) VALUES ('$LIST_B_ID', '$USER_B_ID', 'List B', 1024.0)"
run_sql "INSERT INTO task_list (id, user_id, name, position) VALUES ('$LIST_EMPTY_ID', '$USER_A_ID', 'Empty List', 2048.0)"

TOKEN_A=$(make_token "$USER_A_ID")
TOKEN_B=$(make_token "$USER_B_ID")

echo "Seed complete."
echo ""

# ── Health check ─────────────────────────────────────────────
echo "1. Health check"
RESP=$(curl -s -w "\n%{http_code}" "$BASE_URL/health")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "GET /health returns 200" "200" "$HTTP_CODE"
check_contains "body has status ok" '"ok"' "$BODY"
echo ""

# ── AC1: Create task with required fields only ───────────────
echo "2. AC1: Create task — required fields only"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d "{\"listId\":\"$LIST_A_ID\",\"title\":\"Buy groceries\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "returns 201" "201" "$HTTP_CODE"
check_contains "has id (UUID)" '"id"' "$BODY"
check_contains "listId matches" "\"listId\":\"$LIST_A_ID\"" "$BODY"
check_contains "title is Buy groceries" '"title":"Buy groceries"' "$BODY"
check_contains "priority defaults to none" '"priority":"none"' "$BODY"
check_contains "completedAt is null" '"completedAt":null' "$BODY"
check_contains "version is 0" '"version":0' "$BODY"
check_contains "notes is null" '"notes":null' "$BODY"
check_contains "dueAt is null" '"dueAt":null' "$BODY"
check_contains "has createdAt" '"createdAt"' "$BODY"
check_contains "has updatedAt" '"updatedAt"' "$BODY"
check_not_contains "no userId in response" '"userId"' "$BODY"
check_not_contains "no deletedAt in response" '"deletedAt"' "$BODY"
echo ""

# ── AC2: Create task with all optional fields ────────────────
echo "3. AC2: Create task — all optional fields"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d "{\"listId\":\"$LIST_A_ID\",\"title\":\"Full task\",\"notes\":\"Some notes\",\"dueAt\":\"2026-08-15T10:00:00Z\",\"priority\":\"high\",\"position\":42.5}")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "returns 201" "201" "$HTTP_CODE"
check_contains "notes persisted" '"notes":"Some notes"' "$BODY"
check_contains "dueAt persisted" '"dueAt":"2026-08-15T10:00:00.000Z"' "$BODY"
check_contains "priority persisted" '"priority":"high"' "$BODY"
check_contains "position persisted" '"position":42.5' "$BODY"
echo ""

# ── AC3: Missing / blank title → 422 ────────────────────────
echo "4. AC3: Missing title → 422"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d "{\"listId\":\"$LIST_A_ID\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "returns 422" "422" "$HTTP_CODE"
check_contains "code is VALIDATION_ERROR" '"code":"VALIDATION_ERROR"' "$BODY"
check_contains "details mention title" '"field":"title"' "$BODY"

echo "   AC3: Empty title → 422"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d "{\"listId\":\"$LIST_A_ID\",\"title\":\"\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
check "returns 422" "422" "$HTTP_CODE"

echo "   AC3: Whitespace-only title → 422"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d "{\"listId\":\"$LIST_A_ID\",\"title\":\"   \"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
check "returns 422" "422" "$HTTP_CODE"
echo ""

# ── AC4: Title > 500 chars, notes > 10000 chars ─────────────
echo "5. AC4: Title too long → 422"
LONG_TITLE=$(python3 -c "print('a' * 501)")
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d "{\"listId\":\"$LIST_A_ID\",\"title\":\"$LONG_TITLE\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "returns 422" "422" "$HTTP_CODE"
check_contains "details mention title" '"field":"title"' "$BODY"

echo "   AC4: Notes too long → 422"
LONG_NOTES=$(python3 -c "print('n' * 10001)")
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d "{\"listId\":\"$LIST_A_ID\",\"title\":\"T\",\"notes\":\"$LONG_NOTES\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "returns 422" "422" "$HTTP_CODE"
check_contains "details mention notes" '"field":"notes"' "$BODY"
echo ""

# ── AC5: Other user's list → 404 ────────────────────────────
echo "6. AC5: Creating task in another user's list → 404"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d "{\"listId\":\"$LIST_B_ID\",\"title\":\"Sneaky\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "returns 404" "404" "$HTTP_CODE"
check_contains "code is NOT_FOUND" '"code":"NOT_FOUND"' "$BODY"
check_not_contains "no 403 in body" '403' "$BODY"
check_not_contains "no forbidden in body" 'forbidden' "$BODY"
echo ""

# ── AC6: Invalid priority → 422 ─────────────────────────────
echo "7. AC6: Invalid priority → 422"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d "{\"listId\":\"$LIST_A_ID\",\"title\":\"T\",\"priority\":\"urgent\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "returns 422" "422" "$HTTP_CODE"
check_contains "details mention priority" '"field":"priority"' "$BODY"

echo "   AC6: Case-sensitive priority HIGH → 422"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d "{\"listId\":\"$LIST_A_ID\",\"title\":\"T\",\"priority\":\"HIGH\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
check "returns 422" "422" "$HTTP_CODE"
echo ""

# ── AC7: Default position ────────────────────────────────────
echo "8. AC7: Default position — first task in empty list"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d "{\"listId\":\"$LIST_EMPTY_ID\",\"title\":\"First\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "returns 201" "201" "$HTTP_CODE"
check_contains "position is 1024" '"position":1024' "$BODY"

echo "   AC7: Second task positioned above first"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d "{\"listId\":\"$LIST_EMPTY_ID\",\"title\":\"Second\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "returns 201" "201" "$HTTP_CODE"
check_contains "position is 0 (1024 - 1024)" '"position":0' "$BODY"
echo ""

# ── Auth: No token → 401 ────────────────────────────────────
echo "9. Auth: No authorization header → 401"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/tasks" \
  -H "Content-Type: application/json" \
  -d "{\"listId\":\"$LIST_A_ID\",\"title\":\"No auth\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "returns 401" "401" "$HTTP_CODE"
check_contains "code is UNAUTHORIZED" '"code":"UNAUTHORIZED"' "$BODY"
echo ""

# ── Tenancy: cross-user isolation ────────────────────────────
echo "10. Tenancy: cross-user isolation"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_B" \
  -d "{\"listId\":\"$LIST_B_ID\",\"title\":\"User B task\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
check "User B creates in own list → 201" "201" "$HTTP_CODE"

RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_B" \
  -d "{\"listId\":\"$LIST_A_ID\",\"title\":\"Sneaky B\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
check "User B creates in User A list → 404" "404" "$HTTP_CODE"
echo ""

# ══════════════════════════════════════════════════════════════
# ── POST /v1/lists — Create List smoke tests ─────────────────
# ══════════════════════════════════════════════════════════════

# ── Lists AC1: Create list with valid name ───────────────────
echo "11. Lists AC1: Create list — valid name"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/lists" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d "{\"name\":\"Shopping\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "returns 201" "201" "$HTTP_CODE"
check_contains "has id (UUID)" '"id"' "$BODY"
check_contains "name is Shopping" '"name":"Shopping"' "$BODY"
check_contains "isInbox is false" '"isInbox":false' "$BODY"
check_contains "has position" '"position"' "$BODY"
check_contains "has createdAt" '"createdAt"' "$BODY"
check_contains "has updatedAt" '"updatedAt"' "$BODY"
check_not_contains "no userId in response" '"userId"' "$BODY"
check_not_contains "no deletedAt in response" '"deletedAt"' "$BODY"
echo ""

# ── Lists AC2: Blank/missing name → 422 ─────────────────────
echo "12. Lists AC2: Blank name → 422"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/lists" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d "{\"name\":\"\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "returns 422" "422" "$HTTP_CODE"
check_contains "code is VALIDATION_ERROR" '"code":"VALIDATION_ERROR"' "$BODY"
check_contains "details mention name" '"field":"name"' "$BODY"

echo "   Lists AC2: Whitespace-only name → 422"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/lists" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d "{\"name\":\"   \"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
check "returns 422" "422" "$HTTP_CODE"

echo "   Lists AC2: Missing name → 422"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/lists" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d "{}")
HTTP_CODE=$(echo "$RESP" | tail -1)
check "returns 422" "422" "$HTTP_CODE"
echo ""

# ── Lists AC3: Name > 120 chars → 422 ───────────────────────
echo "13. Lists AC3: Name too long → 422"
LONG_NAME=$(python3 -c "print('x' * 121)")
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/lists" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d "{\"name\":\"$LONG_NAME\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "returns 422" "422" "$HTTP_CODE"
check_contains "details mention name" '"field":"name"' "$BODY"
echo ""

# ── Lists AC4: No auth → 401 ────────────────────────────────
echo "14. Lists AC4: No authorization → 401"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/lists" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"No auth list\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "returns 401" "401" "$HTTP_CODE"
check_contains "code is UNAUTHORIZED" '"code":"UNAUTHORIZED"' "$BODY"
echo ""

# ── Lists AC5: Cross-user isolation ──────────────────────────
echo "15. Lists AC5: Cross-user isolation"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/lists" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_B" \
  -d "{\"name\":\"User B List\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
check "User B creates own list → 201" "201" "$HTTP_CODE"
echo ""

# ── Lists: Position ordering (bottom-append) ─────────────────
echo "16. Lists: Position ordering — bottom-append"
# Use a fresh user (USER_C) with no existing lists to test position ordering
USER_C_ID="33333333-3333-3333-3333-333333333333"
run_sql "INSERT INTO \\\"user\\\" (id, email, password_hash) VALUES ('$USER_C_ID', 'userc@smoke.test', 'h')"
TOKEN_C=$(make_token "$USER_C_ID")

RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/lists" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_C" \
  -d "{\"name\":\"First\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "first list returns 201" "201" "$HTTP_CODE"
check_contains "first list position is 1024" '"position":1024' "$BODY"

RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/lists" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_C" \
  -d "{\"name\":\"Second\"}")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "second list returns 201" "201" "$HTTP_CODE"
check_contains "second list position is 2048" '"position":2048' "$BODY"
echo ""

# ── Summary ──────────────────────────────────────────────────
echo "========================================"
echo "Checks: $CHECKS  |  Failures: $FAILURES"
echo "========================================"

if [ "$FAILURES" -gt 0 ]; then
  echo "SMOKE TESTS FAILED"
  exit 1
fi

echo "ALL SMOKE TESTS PASSED"
exit 0
