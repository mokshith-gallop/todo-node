import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { CreateListSchema } from './schemas';
import { listService } from './service';

const router = Router();

router.post(
  '/',
  authenticate,
  validate(CreateListSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const list = await listService.create(req.userId!, req.body);
      res.status(201).json(list);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
