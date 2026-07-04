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
  visibility: z.enum(['private', 'family', 'public']).default('private'),
  familyId: z.string().optional(),
});

recipesRouter.get('/', async (req: AuthRequest, res: Response) => {
  const families = await prisma.familyMember.findMany({
    where: { userId: req.userId },
    select: { familyId: true },
  });
  const familyIds = families.map((f) => f.familyId);

  const recipes = await prisma.recipe.findMany({
    where: {
      OR: [
        { userId: req.userId },
        { visibility: 'family', familyId: { in: familyIds } },
        { visibility: 'public' },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(recipes);
});

recipesRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  const recipe = await prisma.recipe.findFirst({
    where: { id: String(req.params.id) },
  });
  if (!recipe) throw new AppError(404, 'Рецепт не найден');
  if (recipe.visibility === 'private' && recipe.userId !== req.userId) {
    throw new AppError(403, 'Нет доступа');
  }
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
