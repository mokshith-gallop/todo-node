import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError, ValidationDetail } from '../lib/errors';

/**
 * Express middleware factory that validates req.body against a Zod schema.
 * On success, replaces req.body with the parsed (and potentially transformed) value.
 * On failure, throws a ValidationError which the centralized error handler maps to 422.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details: ValidationDetail[] = result.error.errors.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      }));
      throw new ValidationError(details);
    }

    req.body = result.data;
    next();
  };
}
