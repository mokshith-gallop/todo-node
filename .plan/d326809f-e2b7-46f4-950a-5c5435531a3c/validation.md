# Validation

## Validation — CreateListSchema

### Zod Schema Definition

```ts
export const CreateListSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(120, 'Name must be at most 120 characters')
    .transform((v) => v.trim())
    .pipe(z.string().min(1, 'Name must not be blank')),
});
```

This uses the **exact same trim-then-check pattern** as the existing `CreateTaskSchema.title` field:
1. `min(1)` rejects empty strings before trim
2. `max(120)` enforces length limit on the raw input
3. `.transform(trim)` strips leading/trailing whitespace
4. `.pipe(min(1))` rejects whitespace-only strings after trimming

### Validation Rules Summary

| Input | Result | AC |
|-------|--------|----|
| `{ "name": "Shopping" }` | ✅ Pass, trimmed | AC1 |
| `{ "name": "  My List  " }` | ✅ Pass → `"My List"` | AC1 |
| `{ "name": "" }` | ❌ 422, field: `name` | AC2 |
| `{ "name": "   " }` | ❌ 422, field: `name` | AC2 |
| `{ }` (missing name) | ❌ 422, field: `name` | AC2 |
| `{ "name": "a".repeat(121) }` | ❌ 422, field: `name` | AC3 |
| `{ "name": "a".repeat(120) }` | ✅ Pass (boundary) | AC3 |

### Validation Flow
1. Express body parser parses JSON (malformed → 400 via errorHandler)
2. `validate(CreateListSchema)` middleware runs Zod `safeParse` on `req.body`
3. On failure → throws `ValidationError` with per-field `details` array
4. `errorHandler` catches → responds 422 with standard error envelope
5. On success → `req.body` is replaced with the parsed/trimmed value

### Edge Cases
- **Extra properties silently stripped**: Zod's default `strip` mode removes unknown keys (e.g., `{ "name": "X", "isInbox": true }` → only `name` is kept). The client cannot override `isInbox` or any other field.
- **Non-string name**: `z.string()` rejects numbers, booleans, arrays, null → 422
- **No body at all**: Express parses as `undefined`, Zod fails on `name` → 422
- **DB defense-in-depth**: Even if Zod is bypassed, the `ck_task_list_name_not_blank` CHECK constraint prevents blank names at the database level
