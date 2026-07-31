import express from 'express';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Body parsing
app.use(express.json({ limit: '100kb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Route modules will be mounted here (e.g., /v1/tasks)
// Imported and mounted in the module step

// Centralized error handler — must be registered last
app.use(errorHandler);

export default app;
