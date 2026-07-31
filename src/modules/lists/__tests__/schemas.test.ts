import { describe, it, expect } from 'vitest';
import { CreateListSchema } from '../schemas';

function expectFieldError(input: unknown, field: string) {
  const result = CreateListSchema.safeParse(input);
  expect(result.success).toBe(false);
  if (!result.success) {
    const fieldErrors = result.error.errors.filter(
      (e) => e.path.join('.') === field
    );
    expect(fieldErrors.length).toBeGreaterThan(0);
  }
}

describe('CreateListSchema', () => {
  // --- AC1: valid name ---

  it('AC1: accepts valid name', () => {
    const result = CreateListSchema.safeParse({ name: 'Shopping' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Shopping');
    }
  });

  it('AC1: trims whitespace from name', () => {
    const result = CreateListSchema.safeParse({ name: '  My List  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('My List');
    }
  });

  // --- AC2: blank / missing name ---

  it('AC2: rejects empty string name', () => {
    expectFieldError({ name: '' }, 'name');
  });

  it('AC2: rejects whitespace-only name', () => {
    expectFieldError({ name: '   ' }, 'name');
  });

  it('AC2: rejects missing name field', () => {
    expectFieldError({}, 'name');
  });

  // --- AC3: length limit ---

  it('AC3: rejects name exceeding 120 characters', () => {
    const longName = 'a'.repeat(121);
    expectFieldError({ name: longName }, 'name');
  });

  it('AC3: accepts name exactly 120 characters', () => {
    const name120 = 'a'.repeat(120);
    const result = CreateListSchema.safeParse({ name: name120 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe(name120);
    }
  });

  // --- Extra: type safety ---

  it('rejects non-string name (number)', () => {
    expectFieldError({ name: 42 }, 'name');
  });

  it('rejects non-string name (boolean)', () => {
    expectFieldError({ name: true }, 'name');
  });

  it('rejects non-string name (null)', () => {
    expectFieldError({ name: null }, 'name');
  });

  // --- Extra: unknown properties stripped ---

  it('strips unknown properties', () => {
    const result = CreateListSchema.safeParse({
      name: 'Shopping',
      isInbox: true,
      position: 999,
      userId: 'hacked',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: 'Shopping' });
      expect(result.data).not.toHaveProperty('isInbox');
      expect(result.data).not.toHaveProperty('position');
      expect(result.data).not.toHaveProperty('userId');
    }
  });

  // --- Minimal valid input ---

  it('parses minimal valid input correctly', () => {
    const result = CreateListSchema.safeParse({ name: 'Work' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: 'Work' });
    }
  });
});
