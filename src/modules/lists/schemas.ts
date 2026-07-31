import { z } from 'zod';

export const CreateListSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(120, 'Name must be at most 120 characters')
    .transform((v) => v.trim())
    .pipe(z.string().min(1, 'Name must not be blank')),
});

export type CreateListInput = z.infer<typeof CreateListSchema>;
