import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

// Set env before any app/prisma imports
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://app:mDOfcug5sQV0sNbQdXUtbhkxsAK2lBRF@172.31.0.47:5432/app';
const JWT_SECRET = 'integration-test-secret';

process.env.DATABASE_URL = DATABASE_URL;
process.env.JWT_SECRET = JWT_SECRET;

// Now import app — it will pick up env vars above
import app from '../../../app';

const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;

// --- Helpers ---

const USER_A_ID = '11111111-1111-1111-1111-111111111111';
const USER_B_ID = '22222222-2222-2222-2222-222222222222';
const LIST_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LIST_B_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function tokenFor(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '1h' });
}

async function seedUserA() {
  await prisma.user.create({
    data: { id: USER_A_ID, email: 'usera@test.com', passwordHash: 'hashed' },
  });
  await prisma.taskList.create({
    data: {
      id: LIST_A_ID,
      userId: USER_A_ID,
      name: 'List A',
      position: 1024.0,
    },
  });
}

async function seedUserB() {
  await prisma.user.create({
    data: { id: USER_B_ID, email: 'userb@test.com', passwordHash: 'hashed' },
  });
  await prisma.taskList.create({
    data: {
      id: LIST_B_ID,
      userId: USER_B_ID,
      name: 'List B',
      position: 1024.0,
    },
  });
}

async function cleanup() {
  await prisma.task.deleteMany();
  await prisma.taskList.deleteMany();
  await prisma.user.deleteMany();
}

// --- Lifecycle ---

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

// --- Tests ---

describe('POST /v1/tasks — integration', () => {
  // ── AC1 ────────────────────────────────────────────────────
  it('AC1: creates task with required fields, returns 201 with full task object', async () => {
    await seedUserA();

    const res = await request(app)
      .post('/v1/tasks')
      .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
      .send({ listId: LIST_A_ID, title: 'Test task' })
      .expect(201);

    const body = res.body;

    // Shape assertions
    expect(body.id).toMatch(UUID_RE);
    expect(body.listId).toBe(LIST_A_ID);
    expect(body.title).toBe('Test task');
    expect(body.priority).toBe('none');
    expect(body.completedAt).toBeNull();
    expect(body.version).toBe(0);
    expect(body.notes).toBeNull();
    expect(body.dueAt).toBeNull();
    expect(body.createdAt).toMatch(ISO_DATE_RE);
    expect(body.updatedAt).toMatch(ISO_DATE_RE);

    // userId and deletedAt must NOT be in the response
    expect(body).not.toHaveProperty('userId');
    expect(body).not.toHaveProperty('deletedAt');

    // Verify the row exists in DB
    const dbRow = await prisma.task.findUnique({ where: { id: body.id } });
    expect(dbRow).not.toBeNull();
    expect(dbRow!.title).toBe('Test task');
    expect(dbRow!.userId).toBe(USER_A_ID);
  });

  // ── AC2 ────────────────────────────────────────────────────
  it('AC2: persists all optional fields (notes, dueAt, priority, position)', async () => {
    await seedUserA();

    const res = await request(app)
      .post('/v1/tasks')
      .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
      .send({
        listId: LIST_A_ID,
        title: 'T',
        notes: 'My notes',
        dueAt: '2026-08-15T10:00:00Z',
        priority: 'high',
        position: 42.5,
      })
      .expect(201);

    expect(res.body.notes).toBe('My notes');
    expect(res.body.dueAt).toBe('2026-08-15T10:00:00.000Z');
    expect(res.body.priority).toBe('high');
    expect(res.body.position).toBe(42.5);
  });

  // ── AC3 ────────────────────────────────────────────────────
  describe('AC3: missing/blank title → 422', () => {
    it('rejects missing title', async () => {
      await seedUserA();

      const res = await request(app)
        .post('/v1/tasks')
        .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
        .send({ listId: LIST_A_ID })
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'title' }),
        ])
      );
    });

    it('rejects empty string title', async () => {
      await seedUserA();

      const res = await request(app)
        .post('/v1/tasks')
        .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
        .send({ listId: LIST_A_ID, title: '' })
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'title' }),
        ])
      );
    });

    it('rejects whitespace-only title', async () => {
      await seedUserA();

      const res = await request(app)
        .post('/v1/tasks')
        .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
        .send({ listId: LIST_A_ID, title: '   ' })
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'title' }),
        ])
      );
    });
  });

  // ── AC4 ────────────────────────────────────────────────────
  describe('AC4: field length limits', () => {
    it('rejects title exceeding 500 characters', async () => {
      await seedUserA();

      const res = await request(app)
        .post('/v1/tasks')
        .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
        .send({ listId: LIST_A_ID, title: 'a'.repeat(501) })
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'title' }),
        ])
      );
    });

    it('rejects notes exceeding 10,000 characters', async () => {
      await seedUserA();

      const res = await request(app)
        .post('/v1/tasks')
        .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
        .send({ listId: LIST_A_ID, title: 'T', notes: 'n'.repeat(10_001) })
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'notes' }),
        ])
      );
    });
  });

  // ── AC5 ────────────────────────────────────────────────────
  it('AC5: returns 404 (not 403) when creating task in another user\'s list', async () => {
    await seedUserA();
    await seedUserB();

    const res = await request(app)
      .post('/v1/tasks')
      .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
      .send({ listId: LIST_B_ID, title: 'Sneaky task' })
      .expect(404);

    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toBe('List not found');

    // Must not contain 403 or 'forbidden' anywhere
    const bodyStr = JSON.stringify(res.body).toLowerCase();
    expect(bodyStr).not.toContain('403');
    expect(bodyStr).not.toContain('forbidden');
  });

  // ── AC6 ────────────────────────────────────────────────────
  describe('AC6: invalid priority → 422', () => {
    it('rejects priority "urgent"', async () => {
      await seedUserA();

      const res = await request(app)
        .post('/v1/tasks')
        .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
        .send({ listId: LIST_A_ID, title: 'T', priority: 'urgent' })
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'priority' }),
        ])
      );
    });

    it('rejects case-sensitive priority "HIGH"', async () => {
      await seedUserA();

      const res = await request(app)
        .post('/v1/tasks')
        .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
        .send({ listId: LIST_A_ID, title: 'T', priority: 'HIGH' })
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'priority' }),
        ])
      );
    });
  });

  // ── AC7 ────────────────────────────────────────────────────
  it('AC7: auto-assigns position at top of list (empty → 1024, then decreasing)', async () => {
    await seedUserA();

    // First task in empty list → position 1024.0
    const res1 = await request(app)
      .post('/v1/tasks')
      .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
      .send({ listId: LIST_A_ID, title: 'First' })
      .expect(201);

    expect(res1.body.position).toBe(1024.0);

    // Second task (no position) → should be less than first (top-of-list)
    const res2 = await request(app)
      .post('/v1/tasks')
      .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
      .send({ listId: LIST_A_ID, title: 'Second' })
      .expect(201);

    expect(res2.body.position).toBe(0.0); // 1024.0 - 1024.0
    expect(res2.body.position).toBeLessThan(res1.body.position);

    // Third task → should be less than second
    const res3 = await request(app)
      .post('/v1/tasks')
      .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
      .send({ listId: LIST_A_ID, title: 'Third' })
      .expect(201);

    expect(res3.body.position).toBe(-1024.0); // 0.0 - 1024.0
    expect(res3.body.position).toBeLessThan(res2.body.position);
  });

  // ── Auth ───────────────────────────────────────────────────
  describe('Authentication', () => {
    it('returns 401 when no Authorization header is sent', async () => {
      const res = await request(app)
        .post('/v1/tasks')
        .send({ listId: LIST_A_ID, title: 'No auth' })
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid token', async () => {
      const res = await request(app)
        .post('/v1/tasks')
        .set('Authorization', 'Bearer invalid.token.here')
        .send({ listId: LIST_A_ID, title: 'Bad token' })
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 with expired token', async () => {
      const expiredToken = jwt.sign(
        { sub: USER_A_ID },
        JWT_SECRET,
        { expiresIn: '-1s' } // already expired
      );

      const res = await request(app)
        .post('/v1/tasks')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ listId: LIST_A_ID, title: 'Expired' })
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ── Tenancy ────────────────────────────────────────────────
  describe('Cross-user tenant isolation', () => {
    it('User A creates in own list → 201; User A in User B list → 404; User B list unchanged', async () => {
      await seedUserA();
      await seedUserB();
      const tokenA = tokenFor(USER_A_ID);

      // User A creates task in their own list → 201
      const ownRes = await request(app)
        .post('/v1/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ listId: LIST_A_ID, title: 'My task' })
        .expect(201);

      expect(ownRes.body.listId).toBe(LIST_A_ID);

      // User A tries to create task in User B's list → 404
      await request(app)
        .post('/v1/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ listId: LIST_B_ID, title: 'Sneaky' })
        .expect(404);

      // Verify User B's list still has zero tasks
      const userBTasks = await prisma.task.count({
        where: { listId: LIST_B_ID },
      });
      expect(userBTasks).toBe(0);

      // Verify User A's list has exactly 1 task
      const userATasks = await prisma.task.count({
        where: { listId: LIST_A_ID },
      });
      expect(userATasks).toBe(1);
    });
  });
});
