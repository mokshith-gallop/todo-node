import prisma from '../../lib/prisma';
import { CreateListInput } from './schemas';

const DEFAULT_POSITION = 1024.0;
const POSITION_GAP = 1024.0;

export interface ListResponse {
  id: string;
  name: string;
  position: number;
  isInbox: boolean;
  createdAt: string;
  updatedAt: string;
}

const LIST_SELECT = {
  id: true,
  name: true,
  position: true,
  isInbox: true,
  createdAt: true,
  updatedAt: true,
} as const;

function serializeList(list: {
  id: string;
  name: string;
  position: number;
  isInbox: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ListResponse {
  return {
    id: list.id,
    name: list.name,
    position: list.position,
    isInbox: list.isInbox,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
  };
}

export const listService = {
  async create(userId: string, input: CreateListInput): Promise<ListResponse> {
    // 1. Calculate position (bottom-append)
    const agg = await prisma.taskList.aggregate({
      where: {
        userId,
        deletedAt: null,
      },
      _max: { position: true },
    });

    const position =
      agg._max.position === null
        ? DEFAULT_POSITION
        : agg._max.position + POSITION_GAP;

    // 2. Create the list
    const list = await prisma.taskList.create({
      data: {
        userId,
        name: input.name,
        position,
        isInbox: false,
      },
      select: LIST_SELECT,
    });

    // 3. Serialize and return
    return serializeList(list);
  },
};
