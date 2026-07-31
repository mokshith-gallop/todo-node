import express from 'express';
import { errorHandler } from './middleware/errorHandler';
import tasksRouter from './modules/tasks/router';

const app = express();

// Body parsing
app.use(express.json({ limit: '100kb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Route modules
app.use('/v1/tasks', tasksRouter);

// Centralized error handler — must be registered last
app.use(errorHandler);

export default app;
