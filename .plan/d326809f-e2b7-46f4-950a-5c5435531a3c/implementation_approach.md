# Implementation Approach

## Implementation Approach — Lists Module

### Module Structure
Create `src/modules/lists/` mirroring the existing `tasks/` module exactly:

```
src/modules/lists/
  router.ts        # POST / with authenticate + validate middleware
  service.ts       # listService.create(userId, input)
  schemas.ts       # CreateListSchema (Zod)
  __tests__/
    schemas.test.ts              # Unit: Zod schema validation
    service.test.ts              # Unit: service with mocked Prisma
    lists.integration.test.ts    # Integration: Supertest + real DB
```

### Router (`router.ts`)
- Single route: `POST /` guarded by `authenticate` → `validate(CreateListSchema)` → handler
- Handler calls `listService.create(req.userId!, req.body)`, returns `res.status(201).json(list)`
- Errors forwarded via `next(err)` to the centralized error handler
- Follows the exact pattern from `tasks/router.ts`

### Service (`service.ts`)
- **`listService.create(userId, input)`** — `userId` as explicit first argument (tenant isolation rule)
- **Position calculation (bottom-append)**:
  1. Query `prisma.taskList.aggregate()` for `_max: { position: true }` where `userId` + `deletedAt: null`
  2. If no existing lists → position = `1024.0`
  3. Otherwise → position = `maxPosition + 1024.0`
- **Create**: `prisma.taskList.create()` with `isInbox: false`, `deletedAt` left as default `null`
- **Explicit select**: only the fields needed for the response (no lazy-loading)
- **Serialize**: convert `Date` → ISO string, omit `userId` and `deletedAt`

### Wiring (`app.ts`)
Add one line:
```ts
import listsRouter from './modules/lists/router';
app.use('/v1/lists', listsRouter);
```

### Database Migration
A new Prisma migration adds the `ck_task_list_name_not_blank` CHECK constraint referenced in the story source:
```sql
ALTER TABLE "task_list"
  ADD CONSTRAINT "ck_task_list_name_not_blank"
  CHECK (trim(name) <> '');
```
This is a defense-in-depth measure — Zod validates before the query, but the DB constraint prevents bad data from any path.

### Testing Strategy
Following the tasks module test patterns:

1. **Schema unit tests** (`schemas.test.ts`): valid name, blank name, whitespace-only, > 120 chars, boundary at 120, trim behavior
2. **Service unit tests** (`service.test.ts`): mock Prisma, verify position calculation (empty list, non-empty), verify serialization (Date → ISO, omit userId/deletedAt)
3. **Integration tests** (`lists.integration.test.ts`): Supertest against real DB
   - AC1: POST with valid name → 201, response shape, DB verification
   - AC2: blank/whitespace name → 422 with field-level error
   - AC3: name > 120 chars → 422
   - AC4: no auth → 401
   - AC5: tenant isolation — user A's list has correct userId, user A cannot see user B's lists
4. **Tenancy test case**: user A attempts cross-tenant list creation confirmation (userId is server-set, not client-provided)
