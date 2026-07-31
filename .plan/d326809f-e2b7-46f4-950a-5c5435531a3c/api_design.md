# API Design

## POST /v1/lists — Endpoint Contract

### Request
```
POST /v1/lists
Authorization: Bearer <jwt>
Content-Type: application/json

{ "name": "Shopping" }
```

Single field `name` (string, required). No other fields — `position` is server-calculated, `isInbox` is always `false` for user-created lists.

### Success Response — 201 Created
```json
{
  "id": "uuid",
  "name": "Shopping",
  "position": 2048.0,
  "isInbox": false,
  "createdAt": "2026-07-31T12:00:00.000Z",
  "updatedAt": "2026-07-31T12:00:00.000Z"
}
```

**Omitted from response** (following tasks module convention):
- `userId` — internal, never exposed
- `deletedAt` — always `null` on creation, not useful to the client

### Error Responses

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Missing/invalid/expired JWT |
| 422 | `VALIDATION_ERROR` | Blank name, whitespace-only name, or name > 120 chars |

422 body follows the standard error envelope with per-field `details`:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [{ "field": "name", "message": "Name must not be blank" }]
  }
}
```

### Route Registration
Mounted in `app.ts` as `app.use('/v1/lists', listsRouter)` — parallel to the existing `/v1/tasks` route.
