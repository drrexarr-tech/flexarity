import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const recipesRouter = Router();
recipesRouter.use(authenticate);

const recipeSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  description: z.string().optional(),
  ingredients: z.string().default('[]'),
  instructions: z.string().default('[]'),
  cookingTime: z.coerce.number().optional(),
  category: z.string().optional(),
  imageUrl: z.string().optional(),
  isPublic: z.boolean().default(false),
});

recipesRouter.get('/', async (req: AuthRequest, res: Response) => {
  const recipes = await prisma.recipe.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(recipes);
});

recipesRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  const recipe = await prisma.recipe.findFirst({
    where: { id: String(req.params.id), userId: req.userId },
  });
  if (!recipe) throw new AppError(404, 'Рецепт не найден');
  res.json(recipe);
});

recipesRouter.post('/', async (req: AuthRequest, res: Response) => {
  const data = recipeSchema.parse(req.body);
  const recipe = await prisma.recipe.create({
    data: { ...data, userId: req.userId! },
  });
  res.status(201).json(recipe);
});

recipesRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.recipe.findFirst({
    where: { id: String(req.params.id), userId: req.userId },
  });
  if (!existing) throw new AppError(404, 'Рецепт не найден');

  const data = recipeSchema.partial().parse(req.body);
  const recipe = await prisma.recipe.update({
    where: { id: String(req.params.id) },
    data,
  });
  res.json(recipe);
});

recipesRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.recipe.findFirst({
    where: { id: String(req.params.id), userId: req.userId },
  });
  if (!existing) throw new AppError(404, 'Рецепт не найден');

  await prisma.recipe.delete({ where: { id: String(req.params.id) } });
  res.json({ message: 'Рецепт удалён' });
});
