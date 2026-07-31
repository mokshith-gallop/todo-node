# Validation

## Validation Rules & Edge Cases

### Zod Schema (Single Source of Truth)

```typescript
const CreateTaskSchema = z.object({
  listId: z.string().uuid("Must be a valid UUID"),
  title: z.string()
    .min(1, "Title is required")
    .max(500, "Title must be at most 500 characters")
    .transform(v => v.trim())
    .pipe(z.string().min(1, "Title must not be blank")),
  notes: z.string()
    .max(10_000, "Notes must be at most 10000 characters")
    .optional(),
  dueAt: z.string()
    .datetime({ message: "Must be a valid RFC 3339 datetime" })
    .optional(),
  priority: z.enum(["none", "low", "med", "high"], {
    errorMap: () => ({ message: "Priority must be one of: none, low, med, high" })
  }).optional(),
  position: z.number()
    .finite("Position must be a finite number")
    .optional(),
});
```

### Validation Rules by Field

| Field | Rule | AC |
|-------|------|----|
| `listId` | Required, valid UUID format | AC1 |
| `title` | Required, 1–500 chars after trim, must not be blank/whitespace-only | AC1, AC3, AC4 |
| `notes` | Optional, max 10,000 chars | AC2, AC4 |
| `dueAt` | Optional, valid RFC 3339 datetime string | AC2 |
| `priority` | Optional, must be `none`, `low`, `med`, or `high` | AC2, AC6 |
| `position` | Optional, finite float | AC2, AC7 |

### Edge Cases & Business Rules

1. **Whitespace-only title** (AC3): `"   "` → trim → `""` → fails `min(1)` → 422. The Zod `transform + pipe` pattern handles this: first trim, then re-validate length.

2. **Title exactly 500 chars**: Valid. Title of 501 chars → 422.

3. **Notes exactly 10,000 chars**: Valid. Notes of 10,001 chars → 422.

4. **Other user's list** (AC5): Service checks `task_list WHERE id = listId AND user_id = userId AND deleted_at IS NULL`. If no match → `NotFoundError` → 404. The composite FK is a DB-level backstop, but the service-level check provides the correct error code without exposing existence.

5. **Soft-deleted list**: If a user's own list is soft-deleted, the ownership query filters on `deleted_at IS NULL`, so it returns 404 — tasks cannot be created in deleted lists.

6. **Non-existent listId**: Same 404 path as "other user's list" — no information leakage.

7. **Invalid priority** (AC6): `"urgent"`, `"HIGH"` (case-sensitive), `""`, or `123` → 422 from Zod enum validation.

8. **Position edge cases**: 
   - `NaN`, `Infinity`, `-Infinity` → rejected by `z.number().finite()`
   - Very large or very small floats → accepted (float8 handles them)
   - Negative values → accepted (valid for ordering)

9. **Extra fields in body**: Zod strips unknown fields by default (`.strict()` is not used) — extra fields are silently ignored per REST convention.

10. **Empty body / missing content-type**: Express JSON parser returns 400 before Zod runs. The error handler normalizes this into the standard error envelope.

### Validation Error Format

Per the locked security decision, all validation errors return:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "title", "message": "Title is required" },
      { "field": "priority", "message": "Priority must be one of: none, low, med, high" }
    ]
  }
}
```

Multiple field errors are returned together (Zod validates all fields, not fail-fast).
