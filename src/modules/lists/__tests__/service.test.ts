import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma client before importing the service
vi.mock('../../../lib/prisma', () => {
  return {
    default: {
      taskList: {
        aggregate: vi.fn(),
        create: vi.fn(),
      },
    },
  };
});

import prisma from '../../../lib/prisma';
import { listService } from '../service';
import { CreateListInput } from '../schemas';

const mockTaskListAggregate = vi.mocked(prisma.taskList.aggregate);
const mockTaskListCreate = vi.mocked(prisma.taskList.create);

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LIST_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const NOW = new Date('2026-07-30T12:00:00.000Z');

function makePrismaList(overrides: Record<string, unknown> = {}) {
  return {
    id: LIST_ID,
    name: 'Shopping',
    position: 1024.0,
    isInbox: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function setupEmptyUser() {
  mockTaskListAggregate.mockResolvedValue({ _max: { position: null } } as any);
}

function setupUserWithLists(maxPosition: number) {
  mockTaskListAggregate.mockResolvedValue({
    _max: { position: maxPosition },
  } as any);
}

describe('listService.create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC1: creates list with correct fields, isInbox false, position 1024 for first list', async () => {
    setupEmptyUser();
    mockTaskListCreate.mockResolvedValue(makePrismaList());

    const input: CreateListInput = { name: 'Shopping' };
    const result = await listService.create(USER_ID, input);

    // Verify aggregate was called with correct user filter
    expect(mockTaskListAggregate).toHaveBeenCalledWith({
      where: { userId: USER_ID, deletedAt: null },
      _max: { position: true },
    });

    // Verify create was called with correct data
    expect(mockTaskListCreate).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        name: 'Shopping',
        position: 1024.0,
        isInbox: false,
      },
      select: expect.objectContaining({
        id: true,
        name: true,
        position: true,
        isInbox: true,
        createdAt: true,
        updatedAt: true,
      }),
    });

    // Verify response shape
    expect(result).toEqual({
      id: LIST_ID,
      name: 'Shopping',
      position: 1024.0,
      isInbox: false,
      createdAt: '2026-07-30T12:00:00.000Z',
      updatedAt: '2026-07-30T12:00:00.000Z',
    });
  });

  it('AC1: calculates position maxPosition + 1024 for non-empty user (bottom-append)', async () => {
    setupUserWithLists(2048.0);
    mockTaskListCreate.mockResolvedValue(
      makePrismaList({ position: 3072.0 })
    );

    const input: CreateListInput = { name: 'Work' };
    await listService.create(USER_ID, input);

    // position = 2048.0 + 1024.0 = 3072.0
    expect(mockTaskListCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ position: 3072.0 }),
      })
    );
  });

  it('AC1: sets isInbox to false for user-created lists', async () => {
    setupEmptyUser();
    mockTaskListCreate.mockResolvedValue(makePrismaList());

    const input: CreateListInput = { name: 'Test' };
    const result = await listService.create(USER_ID, input);

    expect(mockTaskListCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isInbox: false }),
      })
    );
    expect(result.isInbox).toBe(false);
  });

  it('AC5: userId is set from argument, not from input', async () => {
    setupEmptyUser();
    mockTaskListCreate.mockResolvedValue(makePrismaList());

    const input: CreateListInput = { name: 'Test' };
    await listService.create(USER_ID, input);

    // userId must come from the first argument, not from the input body
    expect(mockTaskListCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: USER_ID }),
      })
    );

    // aggregate also scoped to userId
    expect(mockTaskListAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: USER_ID }),
      })
    );
  });

  it('serializes Date timestamps to ISO strings', async () => {
    setupEmptyUser();
    const createdAt = new Date('2026-01-15T08:30:00.000Z');
    const updatedAt = new Date('2026-01-15T09:00:00.000Z');
    mockTaskListCreate.mockResolvedValue(
      makePrismaList({ createdAt, updatedAt })
    );

    const input: CreateListInput = { name: 'Test' };
    const result = await listService.create(USER_ID, input);

    expect(result.createdAt).toBe('2026-01-15T08:30:00.000Z');
    expect(result.updatedAt).toBe('2026-01-15T09:00:00.000Z');
  });

  it('omits userId and deletedAt from response', async () => {
    setupEmptyUser();
    mockTaskListCreate.mockResolvedValue(makePrismaList());

    const input: CreateListInput = { name: 'Test' };
    const result = await listService.create(USER_ID, input);

    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('deletedAt');
  });

  it('only selects response fields (no userId, deletedAt in select)', async () => {
    setupEmptyUser();
    mockTaskListCreate.mockResolvedValue(makePrismaList());

    const input: CreateListInput = { name: 'Test' };
    await listService.create(USER_ID, input);

    const selectArg = mockTaskListCreate.mock.calls[0][0].select;
    expect(selectArg).toEqual({
      id: true,
      name: true,
      position: true,
      isInbox: true,
      createdAt: true,
      updatedAt: true,
    });
    expect(selectArg).not.toHaveProperty('userId');
    expect(selectArg).not.toHaveProperty('deletedAt');
  });
});
