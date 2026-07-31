import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError } from '../../../lib/errors';

// Mock Prisma client before importing the service
vi.mock('../../../lib/prisma', () => {
  return {
    default: {
      taskList: {
        findFirst: vi.fn(),
      },
      task: {
        aggregate: vi.fn(),
        create: vi.fn(),
      },
    },
  };
});

import prisma from '../../../lib/prisma';
import { taskService } from '../service';
import { CreateTaskInput } from '../schemas';

const mockTaskListFindFirst = vi.mocked(prisma.taskList.findFirst);
const mockTaskAggregate = vi.mocked(prisma.task.aggregate);
const mockTaskCreate = vi.mocked(prisma.task.create);

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LIST_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TASK_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const NOW = new Date('2026-07-30T12:00:00.000Z');

function makePrismaTask(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    listId: LIST_ID,
    title: 'Buy milk',
    notes: null as string | null,
    dueAt: null as Date | null,
    priority: 'none',
    position: 1024.0,
    completedAt: null as Date | null,
    version: BigInt(0),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function setupListFound() {
  mockTaskListFindFirst.mockResolvedValue({ id: LIST_ID } as any);
}

function setupEmptyList() {
  mockTaskAggregate.mockResolvedValue({ _min: { position: null } } as any);
}

describe('taskService.create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC1: creates task with required fields only — defaults priority, notes, dueAt, position', async () => {
    setupListFound();
    setupEmptyList();
    mockTaskCreate.mockResolvedValue(makePrismaTask());

    const input: CreateTaskInput = { listId: LIST_ID, title: 'Buy milk' };
    const result = await taskService.create(USER_ID, input);

    // Verify list ownership check
    expect(mockTaskListFindFirst).toHaveBeenCalledWith({
      where: { id: LIST_ID, userId: USER_ID, deletedAt: null },
      select: { id: true },
    });

    // Verify position calculation was invoked (empty list path)
    expect(mockTaskAggregate).toHaveBeenCalledWith({
      where: { listId: LIST_ID, userId: USER_ID, deletedAt: null },
      _min: { position: true },
    });

    // Verify task.create called with correct defaults
    expect(mockTaskCreate).toHaveBeenCalledWith({
      data: {
        listId: LIST_ID,
        userId: USER_ID,
        title: 'Buy milk',
        notes: null,
        dueAt: null,
        priority: 'none',
        position: 1024.0,
      },
      select: expect.objectContaining({
        id: true,
        listId: true,
        title: true,
        version: true,
      }),
    });

    // Verify response shape
    expect(result).toEqual({
      id: TASK_ID,
      listId: LIST_ID,
      title: 'Buy milk',
      notes: null,
      dueAt: null,
      priority: 'none',
      position: 1024.0,
      completedAt: null,
      version: 0,
      createdAt: '2026-07-30T12:00:00.000Z',
      updatedAt: '2026-07-30T12:00:00.000Z',
    });

    // version is a number, not BigInt
    expect(typeof result.version).toBe('number');
  });

  it('AC2: creates task with all optional fields persisted', async () => {
    setupListFound();
    const dueDate = new Date('2026-08-15T10:00:00.000Z');

    mockTaskCreate.mockResolvedValue(
      makePrismaTask({
        title: 'Meeting prep',
        notes: 'Slides and agenda',
        dueAt: dueDate,
        priority: 'high',
        position: 42.5,
      })
    );

    const input: CreateTaskInput = {
      listId: LIST_ID,
      title: 'Meeting prep',
      notes: 'Slides and agenda',
      dueAt: '2026-08-15T10:00:00Z',
      priority: 'high',
      position: 42.5,
    };

    const result = await taskService.create(USER_ID, input);

    // Verify data passed to Prisma
    expect(mockTaskCreate).toHaveBeenCalledWith({
      data: {
        listId: LIST_ID,
        userId: USER_ID,
        title: 'Meeting prep',
        notes: 'Slides and agenda',
        dueAt: dueDate,
        priority: 'high',
        position: 42.5,
      },
      select: expect.any(Object),
    });

    // Verify response values
    expect(result.title).toBe('Meeting prep');
    expect(result.notes).toBe('Slides and agenda');
    expect(result.dueAt).toBe('2026-08-15T10:00:00.000Z');
    expect(result.priority).toBe('high');
    expect(result.position).toBe(42.5);
  });

  it('AC5: throws NotFoundError when list does not exist', async () => {
    mockTaskListFindFirst.mockResolvedValue(null);

    const input: CreateTaskInput = { listId: LIST_ID, title: 'Test' };

    await expect(taskService.create(USER_ID, input)).rejects.toThrow(
      NotFoundError
    );
    await expect(taskService.create(USER_ID, input)).rejects.toThrow(
      'List not found'
    );

    // Should NOT have called aggregate or create
    expect(mockTaskAggregate).not.toHaveBeenCalled();
    expect(mockTaskCreate).not.toHaveBeenCalled();
  });

  it('AC7: calculates position 1024.0 for empty list', async () => {
    setupListFound();
    setupEmptyList(); // _min.position = null
    mockTaskCreate.mockResolvedValue(makePrismaTask({ position: 1024.0 }));

    const input: CreateTaskInput = { listId: LIST_ID, title: 'First task' };
    await taskService.create(USER_ID, input);

    expect(mockTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ position: 1024.0 }),
      })
    );
  });

  it('AC7: calculates position min - 1024.0 for non-empty list', async () => {
    setupListFound();
    mockTaskAggregate.mockResolvedValue({
      _min: { position: 500.0 },
    } as any);
    mockTaskCreate.mockResolvedValue(makePrismaTask({ position: -524.0 }));

    const input: CreateTaskInput = { listId: LIST_ID, title: 'New top task' };
    await taskService.create(USER_ID, input);

    // position = 500.0 - 1024.0 = -524.0
    expect(mockTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ position: -524.0 }),
      })
    );
  });

  it('AC2: uses explicit position and skips aggregate query', async () => {
    setupListFound();
    mockTaskCreate.mockResolvedValue(makePrismaTask({ position: 99.9 }));

    const input: CreateTaskInput = {
      listId: LIST_ID,
      title: 'Positioned task',
      position: 99.9,
    };
    await taskService.create(USER_ID, input);

    // aggregate should NOT be called when position is provided
    expect(mockTaskAggregate).not.toHaveBeenCalled();

    expect(mockTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ position: 99.9 }),
      })
    );
  });

  it('serializes BigInt version to number', async () => {
    setupListFound();
    setupEmptyList();
    mockTaskCreate.mockResolvedValue(makePrismaTask({ version: BigInt(5) }));

    const input: CreateTaskInput = { listId: LIST_ID, title: 'Test' };
    const result = await taskService.create(USER_ID, input);

    expect(result.version).toBe(5);
    expect(typeof result.version).toBe('number');
  });

  it('serializes Date timestamps to ISO strings', async () => {
    setupListFound();
    setupEmptyList();
    const createdAt = new Date('2026-01-15T08:30:00.000Z');
    const updatedAt = new Date('2026-01-15T08:30:00.000Z');
    mockTaskCreate.mockResolvedValue(
      makePrismaTask({ createdAt, updatedAt })
    );

    const input: CreateTaskInput = { listId: LIST_ID, title: 'Test' };
    const result = await taskService.create(USER_ID, input);

    expect(result.createdAt).toBe('2026-01-15T08:30:00.000Z');
    expect(result.updatedAt).toBe('2026-01-15T08:30:00.000Z');
  });

  it('omits userId and deletedAt from response', async () => {
    setupListFound();
    setupEmptyList();
    mockTaskCreate.mockResolvedValue(makePrismaTask());

    const input: CreateTaskInput = { listId: LIST_ID, title: 'Test' };
    const result = await taskService.create(USER_ID, input);

    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('deletedAt');
  });
});
