import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string
  ) {
    super(message);
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Ошибка валидации', details: (err as any).errors });
  }

  if (err.name === 'PrismaClientKnownRequestError') {
    return res.status(400).json({ error: 'Ошибка базы данных' });
  }

  console.error('Unhandled error:', err);
  return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
}
