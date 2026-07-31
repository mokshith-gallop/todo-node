import { z } from 'zod';

export const CreateTaskSchema = z.object({
  listId: z.string().uuid('Must be a valid UUID'),
  title: z
    .string()
    .min(1, 'Title is required')
    .max(500, 'Title must be at most 500 characters')
    .transform((v) => v.trim())
    .pipe(z.string().min(1, 'Title must not be blank')),
  notes: z
    .string()
    .max(10_000, 'Notes must be at most 10000 characters')
    .optional(),
  dueAt: z
    .string()
    .datetime({ message: 'Must be a valid RFC 3339 datetime' })
    .optional(),
  priority: z
    .enum(['none', 'low', 'med', 'high'], {
      errorMap: () => ({
        message: 'Priority must be one of: none, low, med, high',
      }),
    })
    .optional(),
  position: z
    .number()
    .finite('Position must be a finite number')
    .optional(),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
