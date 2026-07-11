import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

export const notesRouter = Router();
notesRouter.use(authenticate);

const noteSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  images: z.string().optional(),
  audio: z.string().optional(),
});

notesRouter.get('/', async (req: AuthRequest, res: Response) => {
  const notes = await prisma.note.findMany({
    where: { userId: req.userId },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(notes);
});

notesRouter.post('/', async (req: AuthRequest, res: Response) => {
  const data = noteSchema.parse(req.body);
  const note = await prisma.note.create({
    data: { ...data, userId: req.userId! },
  });
  res.status(201).json(note);
});

notesRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.note.findFirst({
    where: { id: String(req.params.id), userId: req.userId },
  });
  if (!existing) return res.status(404).json({ error: 'Заметка не найдена' });

  const data = noteSchema.partial().parse(req.body);
  const note = await prisma.note.update({
    where: { id: String(req.params.id) },
    data,
  });
  res.json(note);
});

notesRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.note.findFirst({
    where: { id: String(req.params.id), userId: req.userId },
  });
  if (!existing) return res.status(404).json({ error: 'Заметка не найдена' });

  await prisma.note.delete({ where: { id: String(req.params.id) } });
  res.json({ message: 'Заметка удалена' });
});
