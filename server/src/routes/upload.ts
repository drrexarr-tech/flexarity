import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const uploadRouter = Router();

const uploadsDir = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

/** Cyrillic -> Latin so stored names stay ASCII-safe on disk and in URLs. */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh',
  щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  і: 'i', ї: 'yi', є: 'ye', ґ: 'g',
};

function transliterate(value: string): string {
  return value.replace(/[Ѐ-ӿ]/g, (ch) => TRANSLIT[ch] ?? TRANSLIT[ch.toLowerCase()] ?? '');
}

/**
 * multer hands us the client-supplied name verbatim. It can contain Cyrillic,
 * spaces, quotes or path segments, so reduce it to a predictable ASCII stem and
 * always keep the timestamp prefix that guarantees uniqueness.
 */
function safeFilename(original: string): string {
  const rawExt = path.extname(original).toLowerCase();
  const ext = rawExt.replace(/[^a-z0-9.]/g, '').slice(0, 10);

  const stem = transliterate(path.basename(original, rawExt))
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 60);

  return `${Date.now()}-${stem || 'file'}${ext}`;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, safeFilename(file.originalname)),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Только изображения'));
  },
});

const uploadMedia = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, _file, cb) => cb(null, true),
});

uploadRouter.post('/avatar', authenticate, upload.single('avatar'), async (req: AuthRequest, res: Response) => {
  if (!req.file) throw new AppError(400, 'Файл не загружен');

  const avatarUrl = `/api/upload/file/${req.file.filename}`;

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { avatarUrl },
    select: { id: true, email: true, name: true, telegramId: true, vkId: true, avatarUrl: true, dateOfBirth: true, publicKey: true },
  });

  res.json(user);
});

uploadRouter.post('/image', authenticate, uploadMedia.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) throw new AppError(400, 'Файл не загружен');
  const url = `/api/upload/file/${req.file.filename}`;
  res.json({ url });
});

uploadRouter.post('/audio', authenticate, uploadMedia.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) throw new AppError(400, 'Файл не загружен');
  const url = `/api/upload/file/${req.file.filename}`;
  res.json({ url });
});

uploadRouter.get('/file/:filename', async (req: AuthRequest, res: Response) => {
  // This route is intentionally public so <img> tags can load without a
  // token. That makes traversal the real risk: basename() strips any directory
  // component, and the resolve check is the second line of defence.
  const name = path.basename(String(req.params.filename));
  const filePath = path.resolve(uploadsDir, name);

  if (filePath !== path.join(uploadsDir, name) || !filePath.startsWith(uploadsDir + path.sep)) {
    throw new AppError(404, 'Файл не найден');
  }
  if (!fs.existsSync(filePath)) throw new AppError(404, 'Файл не найден');

  res.sendFile(filePath);
});
