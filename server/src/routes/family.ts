import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

export const familyRouter = Router();
familyRouter.use(authenticate);

familyRouter.get('/', async (req: AuthRequest, res: Response) => {
  const members = await prisma.familyMember.findMany({
    where: { userId: req.userId },
    include: {
      family: {
        include: {
          members: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
          invites: true,
        },
      },
    },
  });
  res.json(members.map((m) => m.family));
});

familyRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
  const family = await prisma.family.create({
    data: {
      name,
      members: {
        create: { userId: req.userId!, role: 'admin' },
      },
    },
  });
  res.status(201).json(family);
});

familyRouter.post('/:id/invite', async (req: AuthRequest, res: Response) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const familyId = String(req.params.id);

  const membership = await prisma.familyMember.findFirst({
    where: { familyId, userId: req.userId },
  });
  if (!membership) return res.status(403).json({ error: 'Вы не участник семьи' });

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const already = await prisma.familyMember.findFirst({
      where: { familyId, userId: existingUser.id },
    });
    if (already) return res.status(400).json({ error: 'Пользователь уже в семье' });
  }

  const existingInvite = await prisma.familyInvite.findFirst({
    where: { email, familyId, status: 'pending' },
  });
  if (existingInvite) return res.status(400).json({ error: 'Приглашение уже отправлено' });

  const token = crypto.randomBytes(32).toString('hex');
  const invite = await prisma.familyInvite.create({
    data: { email, token, familyId, inviterId: req.userId! },
  });

  const family = await prisma.family.findUnique({ where: { id: familyId } });

  if (existingUser) {
    await prisma.notification.create({
      data: {
        type: 'family_invite',
        title: `Приглашение в семью`,
        message: `Вас приглашают присоединиться к семье "${family?.name}"`,
        data: JSON.stringify({ familyId, token }),
        link: `/family/invite?token=${token}`,
        userId: existingUser.id,
      },
    });
  }

  const inviter = await prisma.user.findUnique({ where: { id: req.userId } });
  console.log(`[INVITE] ${inviter?.name} пригласил ${email} в семью "${family?.name}" (токен: ${token})`);

  res.json({ message: 'Приглашение отправлено', token });
});

familyRouter.post('/invite/accept', async (req: AuthRequest, res: Response) => {
  const { token } = z.object({ token: z.string() }).parse(req.body);

  const invite = await prisma.familyInvite.findUnique({ where: { token } });
  if (!invite || invite.status !== 'pending') {
    return res.status(400).json({ error: 'Приглашение недействительно' });
  }

  const currentUser = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!currentUser || currentUser.email !== invite.email) {
    return res.status(403).json({ error: 'Это приглашение не для вас' });
  }

  await prisma.familyMember.create({
    data: { userId: req.userId!, familyId: invite.familyId },
  });
  await prisma.familyInvite.update({
    where: { id: invite.id },
    data: { status: 'accepted' },
  });

  res.json({ message: 'Вы присоединились к семье' });
});

familyRouter.delete('/:familyId/member/:userId', async (req: AuthRequest, res: Response) => {
  const familyId = String(req.params.familyId);
  const targetId = String(req.params.userId);

  const membership = await prisma.familyMember.findFirst({
    where: { familyId, userId: req.userId },
  });
  if (!membership || membership.role !== 'admin') {
    return res.status(403).json({ error: 'Только администратор может удалять участников' });
  }

  await prisma.familyMember.deleteMany({
    where: { familyId, userId: targetId },
  });
  res.json({ message: 'Участник удалён' });
});

familyRouter.delete('/:id/leave', async (req: AuthRequest, res: Response) => {
  const familyId = String(req.params.id);
  await prisma.familyMember.deleteMany({
    where: { familyId, userId: req.userId },
  });
  res.json({ message: 'Вы покинули семью' });
});
