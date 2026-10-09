import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { optionalText, optionalNumber } from '../lib/validation';
import { parseRecipe } from '../lib/recipeParser';
import { safeFetchHtml, BlockedUrlError } from '../lib/safeFetch';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const recipesRouter = Router();
recipesRouter.use(authenticate);

const recipeSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  url: optionalText(),
  ingredients: z.string().default('[]'),
  instructions: z.string().default('[]'),
  cookingTime: optionalNumber(),
  category: optionalText(),
  imageUrl: optionalText(),
  isPublic: z.boolean().default(false),
  visibility: z.enum(['private', 'family', 'public']).default('private'),
  familyId: optionalText(),
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

/**
 * Parse an arbitrary recipe page into the shape the form expects. Runs before
 * the ':id' routes conceptually, but those only answer GET/PUT/DELETE so there is
 * no route conflict.
 */
recipesRouter.post('/import', async (req: AuthRequest, res: Response) => {
  const { url } = z.object({ url: z.string().min(1, 'Ссылка обязательна') }).parse(req.body);

  let page: { html: string; charset: string; guessed: boolean };
  try {
    page = await safeFetchHtml(url);
  } catch (err: any) {
    if (err instanceof BlockedUrlError) throw new AppError(400, err.message);
    throw new AppError(422, err.message || 'Не удалось загрузить страницу');
  }

  const parsed = parseRecipe(page.html, url);
  if (!parsed) {
    throw new AppError(
      422,
      'Похоже, это не страница рецепта. Подборки и статьи со ссылками на блюда импортировать нельзя — откройте страницу конкретного рецепта.'
    );
  }

  res.json({
    title: parsed.title,
    ingredients: parsed.ingredients,
    instructions: parsed.instructions,
    cookingTime: parsed.cookingTime,
    image: parsed.image ?? null,
    category: parsed.category ?? null,
    source: parsed.source,
    // Surfaced so a garbled import can be explained: a guessed encoding or the
    // heuristic layer both point at what the markup on the site actually is.
    charset: page.charset,
    charsetGuessed: page.guessed,
  });
});
