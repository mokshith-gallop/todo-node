# Implementation Approach

## Implementation Approach

### File Structure

Following the locked modular monolith pattern:

```
src/modules/tasks/
  router.ts        # POST /v1/tasks route, Zod validation, calls service
  service.ts       # Business logic: ownership check, position calc, create
  schemas.ts       # Zod schemas + zod-to-openapi registration
```

### Request Flow

```
POST /v1/tasks
  → auth middleware (extracts userId from JWT)
  → tasks router (parses & validates body via Zod)
  → taskService.create(userId, validatedBody)
      1. Verify list ownership: SELECT id FROM task_list WHERE id = listId AND user_id = userId AND deleted_at IS NULL
         → If not found, throw NotFoundError (returns 404)
      2. Calculate position:
         - If position provided → use it
         - If not → SELECT MIN(position) FROM task WHERE list_id = listId AND user_id = userId AND deleted_at IS NULL
           → new position = min - 1024.0 (or 1024.0 if list is empty)
      3. INSERT task with all fields, RETURNING full row
      4. Return created task
  → router serializes response (201)
```

### Key Implementation Details

**Tenant isolation** — The service method signature is `create(userId: string, input: CreateTaskInput)`. The `userId` comes from the auth middleware and is passed explicitly — never read from request context. The composite FK `(list_id, user_id)` provides a DB-level backstop, but the service performs an explicit ownership check first to return a clean 404.

**Position assignment** — Default is top-of-list:
- Query: `SELECT MIN(position) FROM task WHERE list_id = ? AND user_id = ? AND deleted_at IS NULL`
- If result is null (empty list): position = `1024.0`
- Otherwise: position = `min_position - 1024.0`
- The gap of 1024.0 provides room for future insertions above
- Rebalancing (when gap < 1e-6) is part of the Reorder story, not this one

**UUID generation** — Handled by PostgreSQL via `gen_random_uuid()` (pgcrypto), not application-side. This avoids any UUID library dependency and guarantees uniqueness at the DB level.

**Timestamps** — `created_at` and `updated_at` default to `now()` in the DB. The service does not set them manually.

**Version** — Defaults to `0` in the DB. Not sent in the create request — only relevant for updates (optimistic concurrency story).

**Prisma query** — Uses explicit `select` (no lazy-loading, per architecture rules):

```typescript
const task = await prisma.task.create({
  data: {
    listId: input.listId,
    userId,
    title: input.title.trim(),
    notes: input.notes ?? null,
    dueAt: input.dueAt ?? null,
    priority: input.priority ?? 'none',
    position: calculatedPosition,
  },
  select: {
    id: true,
    listId: true,
    title: true,
    notes: true,
    dueAt: true,
    priority: true,
    position: true,
    completedAt: true,
    version: true,
    createdAt: true,
    updatedAt: true,
  },
});
```

### Error Handling

- Zod validation failures are caught by the router's validation middleware → 422 with per-field details
- `NotFoundError` from the service layer → 404 via the centralized error handler
- Unexpected DB errors → 500 via the centralized error handler with no internal details leaked

### Testing Requirements (per locked Testing Strategy)

- **Unit tests**: `taskService.create()` with mocked Prisma — happy path, missing list, other user's list, position calculation (empty list, non-empty list)
- **Integration tests**: Full HTTP round-trip via Supertest + Testcontainers — all 7 ACs
- **Tenancy test**: User A creates task in User B's list → expects 404
