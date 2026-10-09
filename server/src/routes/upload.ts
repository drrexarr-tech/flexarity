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
 *
 * The extension comes from the detected MIME type, never from the submitted
 * name: trusting "payload.html" while the filter saw image/png would store a file
 * that res.sendFile then serves as text/html.
 */
function safeFilename(original: string, mimetype?: string): string {
  const stem = transliterate(path.basename(original, path.extname(original)))
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 60);

  const ext = EXT_BY_TYPE[String(mimetype || '').toLowerCase()] ?? '.bin';
  return `${Date.now()}-${stem || 'file'}${ext}`;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, safeFilename(file.originalname, file.mimetype)),
});

/**
 * Allowed media types. uploadMedia used to accept anything, and because nginx
 * serves the SPA and /api from one origin, an uploaded .html or .svg became a
 * same-origin script URL reachable by anyone who was sent the link. Traversal
 * was already blocked; this closes the executable-upload hole next to it.
 */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const AUDIO_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav']);

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'audio/webm': '.weba',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
};

function typeFilter(allowed: Set<string>, label: string) {
  return (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (allowed.has(file.mimetype.toLowerCase())) return cb(null, true);
    cb(new AppError(400, `Разрешены только ${label}`));
  };
}

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: typeFilter(IMAGE_TYPES, 'изображения'),
});

const uploadMedia = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: typeFilter(new Set([...IMAGE_TYPES, ...AUDIO_TYPES]), 'изображения и аудио'),
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

/** Serve with an explicit type so a stray extension can never be re-interpreted. */
const EXT_TO_TYPE: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.weba': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
};

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

  const type = EXT_TO_TYPE[path.extname(filePath).toLowerCase()];
  if (!type) throw new AppError(404, 'Файл не найден');

  res.setHeader('Content-Type', type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.sendFile(filePath);
});
