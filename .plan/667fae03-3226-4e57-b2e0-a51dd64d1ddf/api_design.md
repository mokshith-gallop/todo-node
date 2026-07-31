# API Design

## POST /v1/tasks — API Contract

### Request

**Method**: `POST`  
**Path**: `/v1/tasks`  
**Auth**: Bearer JWT (required)  
**Content-Type**: `application/json`

#### Request Body

```json
{
  "listId": "uuid (required)",
  "title": "string, 1–500 chars (required)",
  "notes": "string, ≤10,000 chars (optional)",
  "dueAt": "RFC 3339 datetime string (optional)",
  "priority": "none | low | med | high (optional, defaults to 'none')",
  "position": "float (optional, defaults to top-of-list)"
}
```

### Success Response — 201 Created

Returns the full task object:

```json
{
  "id": "a1b2c3d4-...",
  "listId": "e5f6a7b8-...",
  "title": "Buy groceries",
  "notes": "Milk, eggs, bread",
  "dueAt": "2026-08-15T10:00:00Z",
  "priority": "med",
  "position": 1024.0,
  "completedAt": null,
  "version": 0,
  "createdAt": "2026-07-30T12:00:00Z",
  "updatedAt": "2026-07-30T12:00:00Z"
}
```

**Notes on response shape:**
- Flat object — no nested `list` or `user` objects (the caller already knows the `listId` they sent)
- `userId` is deliberately **omitted** from the response — it's implicit from the auth context and exposing it adds no value
- `deletedAt` is omitted — newly created tasks are never soft-deleted
- All timestamps returned as ISO 8601 / RFC 3339 UTC strings

### Error Responses

All errors use the standard envelope: `{ "error": { "code": "...", "message": "...", "details": [...] } }`

| Scenario | Status | Code | Details |
|----------|--------|------|---------|
| Missing/blank title | 422 | `VALIDATION_ERROR` | Per-field: `[{ "field": "title", "message": "Title is required" }]` |
| Title > 500 chars | 422 | `VALIDATION_ERROR` | Per-field: `[{ "field": "title", "message": "Title must be at most 500 characters" }]` |
| Notes > 10,000 chars | 422 | `VALIDATION_ERROR` | Per-field: `[{ "field": "notes", "message": "Notes must be at most 10000 characters" }]` |
| Invalid priority | 422 | `VALIDATION_ERROR` | Per-field: `[{ "field": "priority", "message": "Priority must be one of: none, low, med, high" }]` |
| Invalid dueAt format | 422 | `VALIDATION_ERROR` | Per-field: `[{ "field": "dueAt", "message": "Must be a valid RFC 3339 datetime" }]` |
| Missing listId | 422 | `VALIDATION_ERROR` | Per-field: `[{ "field": "listId", "message": "List ID is required" }]` |
| listId not found / other user's list | 404 | `NOT_FOUND` | `"List not found"` (no 403 — don't confirm existence) |
| No auth token | 401 | `UNAUTHORIZED` | `"Authentication required"` |
| Invalid/expired token | 401 | `UNAUTHORIZED` | `"Invalid or expired token"` |
