import prisma from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';
import { CreateTaskInput } from './schemas';

const DEFAULT_POSITION = 1024.0;
const POSITION_GAP = 1024.0;

export interface TaskResponse {
  id: string;
  listId: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  priority: string;
  position: number;
  completedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const TASK_SELECT = {
  id: true,
  listId: true,
  title: true,
  notes: true,
  dueAt: true,
  priority: true,
  position: true,
  completedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

function serializeTask(task: {
  id: string;
  listId: string;
  title: string;
  notes: string | null;
  dueAt: Date | null;
  priority: string;
  position: number;
  completedAt: Date | null;
  version: bigint;
  createdAt: Date;
  updatedAt: Date;
}): TaskResponse {
  return {
    id: task.id,
    listId: task.listId,
    title: task.title,
    notes: task.notes,
    dueAt: task.dueAt ? task.dueAt.toISOString() : null,
    priority: task.priority,
    position: task.position,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    version: Number(task.version),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export const taskService = {
  async create(userId: string, input: CreateTaskInput): Promise<TaskResponse> {
    // 1. Verify list ownership
    const list = await prisma.taskList.findFirst({
      where: {
        id: input.listId,
        userId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!list) {
      throw new NotFoundError('List not found');
    }

    // 2. Calculate position
    let position: number;

    if (input.position !== undefined) {
      position = input.position;
    } else {
      const agg = await prisma.task.aggregate({
        where: {
          listId: input.listId,
          userId,
          deletedAt: null,
        },
        _min: { position: true },
      });

      if (agg._min.position === null) {
        position = DEFAULT_POSITION;
      } else {
        position = agg._min.position - POSITION_GAP;
      }
    }

    // 3. Create the task
    const task = await prisma.task.create({
      data: {
        listId: input.listId,
        userId,
        title: input.title,
        notes: input.notes ?? null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        priority: input.priority ?? 'none',
        position,
      },
      select: TASK_SELECT,
    });

    // 4. Serialize and return
    return serializeTask(task);
  },
};
