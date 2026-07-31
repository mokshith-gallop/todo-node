import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { CreateTaskSchema } from './schemas';
import { taskService } from './service';

const router = Router();

router.post(
  '/',
  authenticate,
  validate(CreateTaskSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const task = await taskService.create(req.userId!, req.body);
      res.status(201).json(task);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
