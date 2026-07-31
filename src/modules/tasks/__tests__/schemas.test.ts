import { describe, it, expect } from 'vitest';
import { CreateTaskSchema } from '../schemas';
import { ZodError } from 'zod';

const VALID_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function expectFieldError(input: unknown, field: string) {
  const result = CreateTaskSchema.safeParse(input);
  expect(result.success).toBe(false);
  if (!result.success) {
    const fieldErrors = result.error.errors.filter(
      (e) => e.path.join('.') === field
    );
    expect(fieldErrors.length).toBeGreaterThan(0);
  }
}

describe('CreateTaskSchema', () => {
  // --- title validation ---

  it('AC3: rejects missing title', () => {
    expectFieldError({ listId: VALID_UUID }, 'title');
  });

  it('AC3: rejects empty string title', () => {
    expectFieldError({ listId: VALID_UUID, title: '' }, 'title');
  });

  it('AC3: rejects blank/whitespace-only title', () => {
    expectFieldError({ listId: VALID_UUID, title: '   ' }, 'title');
  });

  it('AC4: rejects title exceeding 500 characters', () => {
    const longTitle = 'a'.repeat(501);
    expectFieldError({ listId: VALID_UUID, title: longTitle }, 'title');
  });

  it('AC4: accepts title exactly 500 characters', () => {
    const title500 = 'a'.repeat(500);
    const result = CreateTaskSchema.safeParse({ listId: VALID_UUID, title: title500 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe(title500);
    }
  });

  it('AC1: trims whitespace from title', () => {
    const result = CreateTaskSchema.safeParse({
      listId: VALID_UUID,
      title: '  Buy milk  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Buy milk');
    }
  });

  // --- notes validation ---

  it('AC4: rejects notes exceeding 10,000 characters', () => {
    const longNotes = 'n'.repeat(10_001);
    expectFieldError(
      { listId: VALID_UUID, title: 'T', notes: longNotes },
      'notes'
    );
  });

  it('AC4: accepts notes exactly 10,000 characters', () => {
    const notes10k = 'n'.repeat(10_000);
    const result = CreateTaskSchema.safeParse({
      listId: VALID_UUID,
      title: 'T',
      notes: notes10k,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBe(notes10k);
    }
  });

  // --- priority validation ---

  it('AC6: rejects invalid priority "urgent"', () => {
    expectFieldError(
      { listId: VALID_UUID, title: 'T', priority: 'urgent' },
      'priority'
    );
  });

  it('AC6: rejects case-sensitive priority "HIGH"', () => {
    expectFieldError(
      { listId: VALID_UUID, title: 'T', priority: 'HIGH' },
      'priority'
    );
  });

  it('accepts all valid priority values', () => {
    for (const p of ['none', 'low', 'med', 'high'] as const) {
      const result = CreateTaskSchema.safeParse({
        listId: VALID_UUID,
        title: 'T',
        priority: p,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.priority).toBe(p);
      }
    }
  });

  // --- dueAt validation ---

  it('AC2: rejects invalid dueAt format', () => {
    expectFieldError(
      { listId: VALID_UUID, title: 'T', dueAt: 'not-a-date' },
      'dueAt'
    );
  });

  it('AC2: accepts valid RFC 3339 dueAt', () => {
    const result = CreateTaskSchema.safeParse({
      listId: VALID_UUID,
      title: 'T',
      dueAt: '2026-08-15T10:00:00Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dueAt).toBe('2026-08-15T10:00:00Z');
    }
  });

  // --- position validation ---

  it('AC2: rejects Infinity position', () => {
    expectFieldError(
      { listId: VALID_UUID, title: 'T', position: Infinity },
      'position'
    );
  });

  it('AC2: rejects -Infinity position', () => {
    expectFieldError(
      { listId: VALID_UUID, title: 'T', position: -Infinity },
      'position'
    );
  });

  it('AC2: rejects NaN position', () => {
    expectFieldError(
      { listId: VALID_UUID, title: 'T', position: NaN },
      'position'
    );
  });

  it('AC2: accepts finite position', () => {
    const result = CreateTaskSchema.safeParse({
      listId: VALID_UUID,
      title: 'T',
      position: -500.5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.position).toBe(-500.5);
    }
  });

  // --- listId validation ---

  it('rejects missing listId', () => {
    expectFieldError({ title: 'T' }, 'listId');
  });

  it('rejects non-UUID listId', () => {
    expectFieldError({ listId: 'not-a-uuid', title: 'T' }, 'listId');
  });

  // --- optional fields default to undefined ---

  it('parses minimal valid input correctly', () => {
    const result = CreateTaskSchema.safeParse({
      listId: VALID_UUID,
      title: 'Buy milk',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        listId: VALID_UUID,
        title: 'Buy milk',
      });
      expect(result.data.notes).toBeUndefined();
      expect(result.data.dueAt).toBeUndefined();
      expect(result.data.priority).toBeUndefined();
      expect(result.data.position).toBeUndefined();
    }
  });
});
