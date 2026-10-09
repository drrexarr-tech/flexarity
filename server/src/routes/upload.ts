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

  const ext = EXT_BY_TYPE[String(mimetype || '').split(';')[0].trim().toLowerCase()] ?? '.bin';
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
 *
 * The check is on the top-level type, because browsers send parameters with it:
 * ChatsPage records with 'audio/webm;codecs=opus', so an exact match on the raw
 * value would have rejected every voice message. SVG is excluded explicitly, as
 * it is a document type that executes script when loaded directly.
 */
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/tiff': '.tiff',
  'audio/webm': '.weba',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/flac': '.flac',
};

/** image/* and audio/* are inert when rendered; svg/xml/html are not. */
function isAllowedMedia(mimetype: string): boolean {
  const type = mimetype.split(';')[0].trim().toLowerCase();
  if (type === 'image/svg+xml' || type === 'image/svg') return false;
  return type.startsWith('image/') || type.startsWith('audio/');
}

function typeFilter(allowed: 'image' | 'media', label: string) {
  return (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const type = file.mimetype.split(';')[0].trim().toLowerCase();
    const ok =
      allowed === 'image' ? type.startsWith('image/') && type !== 'image/svg+xml' : isAllowedMedia(type);
    if (ok) return cb(null, true);
    cb(new AppError(400, `Разрешены только ${label}`));
  };
}

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: typeFilter('image', 'изображения'),
});

const uploadMedia = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: typeFilter('media', 'изображения и аудио'),
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

/**
 * Serve with an explicit type so a stray extension can never be re-interpreted.
 * Derived from EXT_BY_TYPE so every extension safeFilename can produce is also
 * readable here; an allowed upload that 404s on read would be its own bug.
 */
const EXT_TO_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(EXT_BY_TYPE).map(([type, ext]) => [ext, type])
);

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
