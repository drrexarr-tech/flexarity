import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendEmail, esc } from '../lib/email';

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
          // Pending invite tokens were returned to every member. A token is the
          // only credential for joining, so list the invites without it.
          invites: {
            select: { id: true, email: true, status: true, createdAt: true },
          },
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
  // Membership alone was enough, so any ordinary member could invite arbitrary
  // addresses and turn the SMTP credentials into a spam relay. Member removal
  // below already requires an admin.
  if (membership.role !== 'admin') {
    return res.status(403).json({ error: 'Приглашать может только администратор семьи' });
  }

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
  // The token is a credential, not a diagnostic: it was logged verbatim and
  // returned in the response body on top of being emailed.
  console.log(`[INVITE] ${inviter?.name} пригласил ${email} в семью "${family?.name}"`);

  const inviteLink = `https://veheys.online/family/invite?token=${token}`;
  await sendEmail(
    email,
    `Приглашение в семью "${family?.name}"`,
    `<h2>Приглашение в семью</h2>
     <p>${esc(inviter?.name)} приглашает вас присоединиться к семье "${esc(family?.name)}" в Flex.</p>
     <p><a href="${esc(inviteLink)}">Принять приглашение</a></p>
     <p>Или используйте токен: <b>${esc(token)}</b></p>`
  );

  res.json({ message: 'Приглашение отправлено' });
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

familyRouter.delete('/:familyId/invite/:inviteId', async (req: AuthRequest, res: Response) => {
  const familyId = String(req.params.familyId);
  const inviteId = String(req.params.inviteId);

  const membership = await prisma.familyMember.findFirst({
    where: { familyId, userId: req.userId },
  });
  if (!membership) return res.status(403).json({ error: 'Вы не участник семьи' });

  const invite = await prisma.familyInvite.findFirst({
    where: { id: inviteId, familyId },
  });
  if (!invite) return res.status(404).json({ error: 'Приглашение не найдено' });

  await prisma.familyInvite.delete({ where: { id: inviteId } });
  res.json({ message: 'Приглашение отменено' });
});

familyRouter.delete('/:id/leave', async (req: AuthRequest, res: Response) => {
  const familyId = String(req.params.id);
  await prisma.familyMember.deleteMany({
    where: { familyId, userId: req.userId },
  });
  res.json({ message: 'Вы покинули семью' });
});
