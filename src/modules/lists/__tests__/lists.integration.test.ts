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

function tokenFor(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '1h' });
}

async function seedUserA() {
  await prisma.user.create({
    data: { id: USER_A_ID, email: 'lista@test.com', passwordHash: 'hashed' },
  });
}

async function seedUserB() {
  await prisma.user.create({
    data: { id: USER_B_ID, email: 'listb@test.com', passwordHash: 'hashed' },
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

describe('POST /v1/lists — integration', () => {
  // ── AC1 ────────────────────────────────────────────────────
  it('AC1: creates list with valid name, returns 201 with full list object', async () => {
    await seedUserA();

    const res = await request(app)
      .post('/v1/lists')
      .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
      .send({ name: 'Shopping' })
      .expect(201);

    const body = res.body;

    // Shape assertions
    expect(body.id).toMatch(UUID_RE);
    expect(body.name).toBe('Shopping');
    expect(typeof body.position).toBe('number');
    expect(body.isInbox).toBe(false);
    expect(body.createdAt).toMatch(ISO_DATE_RE);
    expect(body.updatedAt).toMatch(ISO_DATE_RE);

    // userId and deletedAt must NOT be in the response
    expect(body).not.toHaveProperty('userId');
    expect(body).not.toHaveProperty('deletedAt');

    // Verify the row exists in DB with correct userId
    const dbRow = await prisma.taskList.findUnique({ where: { id: body.id } });
    expect(dbRow).not.toBeNull();
    expect(dbRow!.name).toBe('Shopping');
    expect(dbRow!.userId).toBe(USER_A_ID);
    expect(dbRow!.isInbox).toBe(false);
    expect(dbRow!.deletedAt).toBeNull();
  });

  it('AC1: trims whitespace from name', async () => {
    await seedUserA();

    const res = await request(app)
      .post('/v1/lists')
      .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
      .send({ name: '  My List  ' })
      .expect(201);

    expect(res.body.name).toBe('My List');
  });

  // ── AC2 ────────────────────────────────────────────────────
  describe('AC2: blank/missing name → 422', () => {
    it('rejects missing name', async () => {
      await seedUserA();

      const res = await request(app)
        .post('/v1/lists')
        .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
        .send({})
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'name' }),
        ])
      );
    });

    it('rejects empty string name', async () => {
      await seedUserA();

      const res = await request(app)
        .post('/v1/lists')
        .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
        .send({ name: '' })
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'name' }),
        ])
      );
    });

    it('rejects whitespace-only name', async () => {
      await seedUserA();

      const res = await request(app)
        .post('/v1/lists')
        .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
        .send({ name: '   ' })
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'name' }),
        ])
      );
    });
  });

  // ── AC3 ────────────────────────────────────────────────────
  describe('AC3: name length limits', () => {
    it('rejects name exceeding 120 characters', async () => {
      await seedUserA();

      const res = await request(app)
        .post('/v1/lists')
        .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
        .send({ name: 'a'.repeat(121) })
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'name' }),
        ])
      );
    });

    it('accepts name exactly 120 characters (boundary)', async () => {
      await seedUserA();

      const name120 = 'b'.repeat(120);
      const res = await request(app)
        .post('/v1/lists')
        .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
        .send({ name: name120 })
        .expect(201);

      expect(res.body.name).toBe(name120);
    });
  });

  // ── AC4 ────────────────────────────────────────────────────
  describe('AC4: authentication', () => {
    it('returns 401 when no Authorization header is sent', async () => {
      const res = await request(app)
        .post('/v1/lists')
        .send({ name: 'No auth' })
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid token', async () => {
      const res = await request(app)
        .post('/v1/lists')
        .set('Authorization', 'Bearer invalid.token.here')
        .send({ name: 'Bad token' })
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 with expired token', async () => {
      const expiredToken = jwt.sign(
        { sub: USER_A_ID },
        JWT_SECRET,
        { expiresIn: '-1s' }
      );

      const res = await request(app)
        .post('/v1/lists')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ name: 'Expired' })
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ── AC5 ────────────────────────────────────────────────────
  describe('AC5: tenant isolation', () => {
    it('userId in DB is set to authenticated user, not client-provided', async () => {
      await seedUserA();

      const res = await request(app)
        .post('/v1/lists')
        .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
        .send({ name: 'My list', userId: USER_B_ID })
        .expect(201);

      // Even though userId was sent in the body, the DB row should have USER_A_ID
      const dbRow = await prisma.taskList.findUnique({ where: { id: res.body.id } });
      expect(dbRow!.userId).toBe(USER_A_ID);
    });

    it('User A and User B lists are isolated', async () => {
      await seedUserA();
      await seedUserB();

      // User A creates a list
      const resA = await request(app)
        .post('/v1/lists')
        .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
        .send({ name: 'A List' })
        .expect(201);

      // User B creates a list
      const resB = await request(app)
        .post('/v1/lists')
        .set('Authorization', `Bearer ${tokenFor(USER_B_ID)}`)
        .send({ name: 'B List' })
        .expect(201);

      // Verify each list has the correct userId in DB
      const dbRowA = await prisma.taskList.findUnique({ where: { id: resA.body.id } });
      expect(dbRowA!.userId).toBe(USER_A_ID);

      const dbRowB = await prisma.taskList.findUnique({ where: { id: resB.body.id } });
      expect(dbRowB!.userId).toBe(USER_B_ID);

      // Verify User A has exactly 1 list, User B has exactly 1 list
      const userALists = await prisma.taskList.count({ where: { userId: USER_A_ID } });
      expect(userALists).toBe(1);

      const userBLists = await prisma.taskList.count({ where: { userId: USER_B_ID } });
      expect(userBLists).toBe(1);
    });
  });

  // ── Position ordering ─────────────────────────────────────
  it('bottom-appends: first list → 1024, second → 2048, third → 3072', async () => {
    await seedUserA();

    const res1 = await request(app)
      .post('/v1/lists')
      .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
      .send({ name: 'First' })
      .expect(201);

    expect(res1.body.position).toBe(1024.0);

    const res2 = await request(app)
      .post('/v1/lists')
      .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
      .send({ name: 'Second' })
      .expect(201);

    expect(res2.body.position).toBe(2048.0);
    expect(res2.body.position).toBeGreaterThan(res1.body.position);

    const res3 = await request(app)
      .post('/v1/lists')
      .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
      .send({ name: 'Third' })
      .expect(201);

    expect(res3.body.position).toBe(3072.0);
    expect(res3.body.position).toBeGreaterThan(res2.body.position);
  });

  // ── Extra properties stripped ──────────────────────────────
  it('ignores extra properties like isInbox in request body', async () => {
    await seedUserA();

    const res = await request(app)
      .post('/v1/lists')
      .set('Authorization', `Bearer ${tokenFor(USER_A_ID)}`)
      .send({ name: 'Hacked', isInbox: true, position: 999 })
      .expect(201);

    // isInbox must be false regardless of what client sent
    expect(res.body.isInbox).toBe(false);

    // position must be server-calculated, not client-provided
    expect(res.body.position).toBe(1024.0);
  });
});
