import express from 'express';
import http from 'http';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfigPath = path.join(__dirname, 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));

if (getApps().length === 0) {
  initializeApp({ projectId: firebaseConfig.projectId });
}

const UPLOAD_ROOT = path.join(__dirname, 'uploads');
const CHUNK_TEMP_ROOT = path.join(UPLOAD_ROOT, '_chunks');
const ALLOWED_CATEGORIES = ['posters', 'backdrops', 'stills', 'trailers', 'videos'] as const;
type UploadCategory = (typeof ALLOWED_CATEGORIES)[number];

for (const cat of ALLOWED_CATEGORIES) {
  fs.mkdirSync(path.join(UPLOAD_ROOT, cat), { recursive: true });
}
fs.mkdirSync(CHUNK_TEMP_ROOT, { recursive: true });

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp', '.heic', '.heif']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.avi']);

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
  'image/heic',
  'image/heif',
]);
const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
  'video/x-matroska',
  'video/x-msvideo',
]);

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
};

const BOOTSTRAPPED_ADMIN_EMAIL = 'az1606276@gmail.com';

async function verifyIsAdmin(authHeader: string | undefined): Promise<{ uid: string; email: string } | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const decoded = await getAuth().verifyIdToken(token);
    if (!decoded.email_verified || !decoded.email) return null;
    if (decoded.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL) {
      return { uid: decoded.uid, email: decoded.email };
    }
    return null;
  } catch (err) {
    console.error('Admin verification error:', err);
    return null;
  }
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const categoryRaw = String(req.query.category || req.body?.category || 'posters');
    const category: UploadCategory = (ALLOWED_CATEGORIES as readonly string[]).includes(categoryRaw)
      ? (categoryRaw as UploadCategory)
      : 'posters';
    cb(null, path.join(UPLOAD_ROOT, category));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext) ? ext : '.bin';
    const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const categoryRaw = String(req.query.category || 'posters');
    const isVideoCategory = categoryRaw === 'videos' || categoryRaw === 'trailers';
    const ext = path.extname(file.originalname).toLowerCase();

    if (isVideoCategory) {
      if (VIDEO_EXTS.has(ext) || VIDEO_MIMES.has(file.mimetype) || file.mimetype.startsWith('video/')) {
        cb(null, true);
        return;
      }
      cb(new Error('Invalid video format. Supported: MP4, WebM, MOV, M4V.'));
      return;
    }

    if (IMAGE_EXTS.has(ext) || IMAGE_MIMES.has(file.mimetype) || file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Invalid image format. Supported: JPG, PNG, WebP, GIF, AVIF.'));
  },
});

const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'az-films' });
  });

  const requireAdmin: express.RequestHandler = async (req, res, next) => {
    const admin = await verifyIsAdmin(req.headers.authorization);
    if (!admin) {
      res.status(403).json({ error: 'Admin authorization required for media uploads.' });
      return;
    }
    next();
  };

  function isPrivateHostname(hostname: string): boolean {
    const h = hostname.toLowerCase().trim();
    if (
      h === 'localhost' ||
      h === '::1' ||
      h === '[::1]' ||
      h.endsWith('.local') ||
      h.endsWith('.internal')
    ) {
      return true;
    }
    if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) {
      return true;
    }
    const m172 = h.match(/^172\.(\d+)\./);
    if (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31) {
      return true;
    }
    return false;
  }

  function suggestCloudUrlRepair(rawUrl: string): string | null {
    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.startsWith('/') || trimmed.startsWith('data:')) return null;
    let next = trimmed;
    if (/^http:\/\//i.test(next) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(next)) {
      next = next.replace(/^http:\/\//i, 'https://');
    }
    const driveOpen = next.match(/drive\.google\.com\/(?:open\?id=|uc\?(?:[^#]*&)?id=)([a-zA-Z0-9_-]+)/i);
    if (driveOpen) {
      next = `https://drive.google.com/file/d/${driveOpen[1]}/view`;
    } else {
      const driveView = next.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
      if (driveView && !next.includes('/preview') && next.includes('?')) {
        next = `https://drive.google.com/file/d/${driveView[1]}/view`;
      }
    }
    if (/dropbox\.com/i.test(next)) {
      if (/[?&]dl=[01]/.test(next)) {
        next = next.replace(/([?&])dl=[01]/, '$1raw=1');
      } else if (!/[?&]raw=1/.test(next)) {
        next = `${next}${next.includes('?') ? '&' : '?'}raw=1`;
      }
    }
    const ghBlob = next.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i);
    if (ghBlob) {
      next = `https://raw.githubusercontent.com/${ghBlob[1]}/${ghBlob[2]}/${ghBlob[3]}`;
    }
    return next !== trimmed ? next : null;
  }

  app.get('/api/az-tech/status', requireAdmin, (_req, res) => {
    const countFiles = (dir: string) => {
      try {
        if (!fs.existsSync(dir)) return 0;
        return fs.readdirSync(dir).filter((n) => !n.startsWith('.')).length;
      } catch {
        return 0;
      }
    };
    const aistudioAssets = countFiles(path.join(__dirname, 'public', 'assets', 'aistudio'));
    const postersCount = countFiles(path.join(__dirname, 'public', 'posters'));
    const uploadsCount = ALLOWED_CATEGORIES.reduce(
      (sum, cat) => sum + countFiles(path.join(UPLOAD_ROOT, cat)),
      0
    );
    const mem = process.memoryUsage();
    res.json({
      status: 'online',
      service: 'az-tech-center',
      nodeVersion: process.version,
      uptimeSec: Math.round(process.uptime()),
      memoryMb: Math.round(mem.rss / (1024 * 1024)),
      localAssetsCount: aistudioAssets + postersCount,
      uploadsCount,
      serverTimeIso: new Date().toISOString(),
    });
  });

  app.post('/api/az-tech/probe-links', requireAdmin, async (req, res) => {
    const rawTargets = Array.isArray(req.body?.targets) ? req.body.targets.slice(0, 40) : [];
    const results = await Promise.all(
      rawTargets.map(
        async (item: { id?: string; filmId?: string; field?: string; label?: string; url?: string }) => {
          const id = String(item?.id || '');
          const filmId = typeof item?.filmId === 'string' ? item.filmId : undefined;
          const field = String(item?.field || 'videoUrl');
          const label = String(item?.label || '');
          const url = String(item?.url || '').trim();
          const startedAt = Date.now();

          if (!url) {
            return {
              id,
              filmId,
              field,
              label,
              url,
              suggestedUrl: null,
              ok: false,
              status: 0,
              contentType: '',
              sizeBytes: 0,
              latencyMs: 0,
              issue: 'empty',
              devOnlyUpload: false,
            };
          }

          if (url.startsWith('data:')) {
            return {
              id,
              filmId,
              field,
              label,
              url: `${url.slice(0, 42)}...`,
              suggestedUrl: null,
              ok: true,
              status: 200,
              contentType: 'data-uri',
              sizeBytes: url.length,
              latencyMs: 1,
              issue: null,
              devOnlyUpload: false,
            };
          }

          if (url.startsWith('/')) {
            const cleanRel = url.split('?')[0];
            const safeRel = path.normalize(cleanRel).replace(/^(\.\.(\/|\\|$))+/, '');
            const candidates = [
              path.join(__dirname, 'public', safeRel),
              path.join(__dirname, 'dist', safeRel),
            ];
            if (safeRel.startsWith('/uploads/') || safeRel.startsWith('uploads/')) {
              const parts = safeRel.replace(/^\/+/, '').split('/');
              if (parts.length >= 3 && (ALLOWED_CATEGORIES as readonly string[]).includes(parts[1])) {
                candidates.unshift(path.join(UPLOAD_ROOT, parts[1], path.basename(parts.slice(2).join('/'))));
              }
            }
            const found = candidates.find((p) => {
              try {
                return fs.existsSync(p) && fs.statSync(p).isFile();
              } catch {
                return false;
              }
            });
            const devOnlyUpload = cleanRel.startsWith('/uploads/');
            if (!found) {
              return {
                id,
                filmId,
                field,
                label,
                url,
                suggestedUrl: null,
                ok: false,
                status: 404,
                contentType: '',
                sizeBytes: 0,
                latencyMs: Date.now() - startedAt,
                issue: devOnlyUpload ? 'dev_upload_missing' : 'missing_local_file',
                devOnlyUpload,
              };
            }
            const stat = fs.statSync(found);
            const ext = path.extname(found).toLowerCase();
            return {
              id,
              filmId,
              field,
              label,
              url,
              suggestedUrl: null,
              ok: true,
              status: 200,
              contentType: MIME_BY_EXT[ext] || 'application/octet-stream',
              sizeBytes: stat.size,
              latencyMs: Date.now() - startedAt,
              issue: devOnlyUpload ? 'dev_only_upload' : null,
              devOnlyUpload,
            };
          }

          let parsed: URL;
          try {
            parsed = new URL(url);
          } catch {
            return {
              id,
              filmId,
              field,
              label,
              url,
              suggestedUrl: suggestCloudUrlRepair(url),
              ok: false,
              status: 0,
              contentType: '',
              sizeBytes: 0,
              latencyMs: Date.now() - startedAt,
              issue: 'invalid_url',
              devOnlyUpload: false,
            };
          }

          if (!['http:', 'https:'].includes(parsed.protocol) || isPrivateHostname(parsed.hostname)) {
            return {
              id,
              filmId,
              field,
              label,
              url,
              suggestedUrl: null,
              ok: false,
              status: 0,
              contentType: '',
              sizeBytes: 0,
              latencyMs: Date.now() - startedAt,
              issue: 'blocked_host',
              devOnlyUpload: false,
            };
          }

          const suggestedUrl = suggestCloudUrlRepair(url);
          const probeTarget = suggestedUrl || url;
          try {
            let resp = await fetch(probeTarget, {
              method: 'HEAD',
              redirect: 'follow',
              signal: AbortSignal.timeout(4500),
            });
            if (resp.status === 405 || resp.status === 501) {
              resp = await fetch(probeTarget, {
                method: 'GET',
                headers: { Range: 'bytes=0-1023' },
                redirect: 'follow',
                signal: AbortSignal.timeout(4500),
              });
            }
            const ct = resp.headers.get('content-type') || '';
            const cl = Number(resp.headers.get('content-length') || 0);
            const ok = resp.ok || resp.status === 206;
            return {
              id,
              filmId,
              field,
              label,
              url,
              suggestedUrl,
              ok,
              status: resp.status,
              contentType: ct,
              sizeBytes: isFinite(cl) ? cl : 0,
              latencyMs: Date.now() - startedAt,
              issue: ok ? (suggestedUrl ? 'can_optimize' : null) : `http_${resp.status}`,
              devOnlyUpload: false,
            };
          } catch {
            return {
              id,
              filmId,
              field,
              label,
              url,
              suggestedUrl,
              ok: false,
              status: 0,
              contentType: '',
              sizeBytes: 0,
              latencyMs: Date.now() - startedAt,
              issue: 'unreachable',
              devOnlyUpload: false,
            };
          }
        }
      )
    );
    res.json({ checkedAtIso: new Date().toISOString(), results });
  });

  // Single-request upload endpoint
  app.post('/api/upload', requireAdmin, (req, res) => {
    const categoryRaw = String(req.query.category || 'posters');
    if (!(ALLOWED_CATEGORIES as readonly string[]).includes(categoryRaw)) {
      res.status(400).json({ error: 'Invalid upload category.' });
      return;
    }

    upload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed.' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'No file provided.' });
        return;
      }
      const url = `/uploads/${categoryRaw}/${req.file.filename}`;
      res.json({
        url,
        filename: req.file.filename,
        size: req.file.size,
        mimeType: req.file.mimetype,
      });
    });
  });

  // Chunked upload endpoints (for large MP4 trailers & full films bypassing 32MB proxy caps)
  app.post('/api/upload/init', requireAdmin, (req, res) => {
    const categoryRaw = String(req.body?.category || 'videos');
    const filename = String(req.body?.filename || 'video.mp4');
    if (!(ALLOWED_CATEGORIES as readonly string[]).includes(categoryRaw)) {
      res.status(400).json({ error: 'Invalid upload category.' });
      return;
    }
    const ext = path.extname(filename).toLowerCase();
    const safeExt = VIDEO_EXTS.has(ext) || IMAGE_EXTS.has(ext) ? ext : '.mp4';
    const uploadId = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const tempDir = path.join(CHUNK_TEMP_ROOT, uploadId);
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'meta.json'), JSON.stringify({ category: categoryRaw, ext: safeExt }));
    res.json({ uploadId });
  });

  app.post('/api/upload/chunk', requireAdmin, chunkUpload.single('chunk'), (req, res) => {
    const uploadId = path.basename(String(req.query.uploadId || ''));
    const index = Number(req.query.index);
    const tempDir = path.join(CHUNK_TEMP_ROOT, uploadId);
    if (!uploadId || isNaN(index) || !fs.existsSync(tempDir) || !req.file) {
      res.status(400).json({ error: 'Invalid chunk upload parameters.' });
      return;
    }
    fs.writeFileSync(path.join(tempDir, `part_${String(index).padStart(6, '0')}`), req.file.buffer);
    res.json({ ok: true, index });
  });

  app.post('/api/upload/complete', requireAdmin, async (req, res) => {
    const uploadId = path.basename(String(req.body?.uploadId || ''));
    const totalChunks = Number(req.body?.totalChunks || 0);
    const tempDir = path.join(CHUNK_TEMP_ROOT, uploadId);

    if (!uploadId || !fs.existsSync(tempDir) || totalChunks <= 0) {
      res.status(400).json({ error: 'Invalid upload completion request.' });
      return;
    }

    try {
      const meta = JSON.parse(fs.readFileSync(path.join(tempDir, 'meta.json'), 'utf-8'));
      const category: UploadCategory = (ALLOWED_CATEGORIES as readonly string[]).includes(meta.category)
        ? meta.category
        : 'videos';
      const finalFilename = `${uploadId}${meta.ext || '.mp4'}`;
      const finalPath = path.join(UPLOAD_ROOT, category, finalFilename);

      const writeStream = fs.createWriteStream(finalPath);
      for (let i = 0; i < totalChunks; i++) {
        const partPath = path.join(tempDir, `part_${String(i).padStart(6, '0')}`);
        if (!fs.existsSync(partPath)) {
          writeStream.close();
          res.status(400).json({ error: `Missing chunk ${i}` });
          return;
        }
        const buf = fs.readFileSync(partPath);
        writeStream.write(buf);
      }
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        writeStream.end();
      });

      fs.rmSync(tempDir, { recursive: true, force: true });
      res.json({ url: `/uploads/${category}/${finalFilename}`, filename: finalFilename });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to assemble upload.' });
    }
  });

  function streamMediaFile(req: express.Request, res: express.Response, filePath: string) {
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';

    if (VIDEO_EXTS.has(ext)) {
      const range = req.headers.range;
      const fileSize = stat.size;
      const maxChunkBytes = 4 * 1024 * 1024;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        let start = parseInt(parts[0], 10);
        let end: number;

        if (parts[0] === '' && parts[1]) {
          const suffixLen = Math.min(parseInt(parts[1], 10), maxChunkBytes);
          start = Math.max(0, fileSize - suffixLen);
          end = fileSize - 1;
        } else {
          const requestedEnd = parts[1]
            ? parseInt(parts[1], 10)
            : start + maxChunkBytes - 1;
          end = Math.min(requestedEnd, start + maxChunkBytes - 1, fileSize - 1);
        }

        if (isNaN(start) || isNaN(end) || start < 0 || start >= fileSize || start > end) {
          res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
          return;
        }

        const chunkSize = end - start + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
        });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Accept-Ranges': 'bytes',
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
        });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        fs.createReadStream(filePath).pipe(res);
      }
      return;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  }

  // Stream uploaded media with full HTTP Range (206 Partial Content) support
  app.get('/uploads/:category/:filename', (req, res) => {
    const { category, filename } = req.params;
    if (!(ALLOWED_CATEGORIES as readonly string[]).includes(category)) {
      res.status(404).end();
      return;
    }

    const safeName = path.basename(filename);
    const filePath = path.join(UPLOAD_ROOT, category, safeName);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Media file not found.' });
      return;
    }

    streamMediaFile(req, res, filePath);
  });

  // Stream bundled video assets with capped 4MB HTTP Range chunks for iOS Safari & Cloud Run
  app.get('/assets/aistudio/:filename', (req, res, next) => {
    const safeName = path.basename(req.params.filename);
    const ext = path.extname(safeName).toLowerCase();
    if (!VIDEO_EXTS.has(ext)) {
      next();
      return;
    }
    const candidates = [
      path.join(__dirname, 'dist', 'assets', 'aistudio', safeName),
      path.join(__dirname, 'public', 'assets', 'aistudio', safeName),
    ];
    const existing = candidates.find((p) => fs.existsSync(p));
    if (!existing) {
      res.status(404).json({ error: 'Video asset not found.' });
      return;
    }
    streamMediaFile(req, res, existing);
  });

  const FILM_OG_MAP: Record<string, { title: string; description: string; image: string }> = {
    'the-tree': {
      title: 'الشجرة — THE TREE | AZ FILMS',
      description: 'فيلم عن الأرض والذاكرة والوفاء من إنتاج AZ ORIGINALS.',
      image: '/posters/the-tree.jpg',
    },
    'az-the-last-road': {
      title: 'عز: الطريق الأخير — AZ — THE LAST ROAD | AZ FILMS',
      description: 'تدور أحداث الفيلم في بريطانيا عام 1941 خلال الحرب العالمية الثانية — بعض الطرق تنتهي لكن بعض الصداقات تبقى إلى الأبد.',
      image: '/assets/aistudio/036a1170-ed5a-4c3a-83f0-774dffa612ae_a02bbf5e.png',
    },
    'the-last-operation': {
      title: 'العملية الأخيرة — THE LAST OPERATION | AZ FILMS',
      description: 'أكشن، جريمة، تشويق، دراما أمنية من إنتاج AZ FILMS.',
      image: '/assets/aistudio/61f9defc-5146-4b3c-8de3-9ec0227a9c45_bd0d1aba.png',
    },
  };

  const escapeMetaAttr = (val: string) =>
    val.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    const distIndexPath = path.join(distDir, 'index.html');
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders: (res, filePath) => {
          const base = path.basename(filePath);
          if (
            base === 'sw.js' ||
            base === 'registerSW.js' ||
            base === 'manifest.webmanifest' ||
            base === 'index.html'
          ) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          } else if (
            filePath.includes(`${path.sep}assets${path.sep}`) &&
            !filePath.includes(`${path.sep}aistudio${path.sep}`) &&
            (base.endsWith('.js') || base.endsWith('.css'))
          ) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.get('*', (req, res) => {
      if (
        req.path.startsWith('/uploads/') ||
        req.path.startsWith('/assets/') ||
        req.path.startsWith('/posters/')
      ) {
        res.status(404).end();
        return;
      }

      const filmParam = typeof req.query.film === 'string' ? req.query.film.trim() : '';
      const ogFilm = filmParam ? FILM_OG_MAP[filmParam] : undefined;

      try {
        let html = fs.readFileSync(distIndexPath, 'utf-8');
        const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
        const host = req.get('x-forwarded-host') || req.get('host') || '';
        const origin = host ? `${proto}://${host}` : '';

        if (ogFilm) {
          const safeTitle = escapeMetaAttr(ogFilm.title);
          const safeDesc = escapeMetaAttr(ogFilm.description);
          const absImage = escapeMetaAttr(origin ? `${origin}${ogFilm.image}` : ogFilm.image);

          html = html
            .replace(/<title>.*?<\/title>/, `<title>${safeTitle}</title>`)
            .replace(
              /<meta name="description" content="[^"]*"\s*\/?>/,
              `<meta name="description" content="${safeDesc}" />`
            )
            .replace(
              /<meta property="og:title" content="[^"]*"\s*\/?>/,
              `<meta property="og:title" content="${safeTitle}" />`
            )
            .replace(
              /<meta property="og:description" content="[^"]*"\s*\/?>/,
              `<meta property="og:description" content="${safeDesc}" />`
            )
            .replace(
              /<meta property="og:image" content="[^"]*"\s*\/?>/,
              `<meta property="og:image" content="${absImage}" />`
            )
            .replace(
              /<meta name="twitter:image" content="[^"]*"\s*\/?>/,
              `<meta name="twitter:image" content="${absImage}" />`
            );
        } else if (origin) {
          const defaultAbsImage = escapeMetaAttr(
            `${origin}/assets/aistudio/61f9defc-5146-4b3c-8de3-9ec0227a9c45_bd0d1aba.png`
          );
          html = html
            .replace(
              /<meta property="og:image" content="[^"]*"\s*\/?>/,
              `<meta property="og:image" content="${defaultAbsImage}" />`
            )
            .replace(
              /<meta name="twitter:image" content="[^"]*"\s*\/?>/,
              `<meta name="twitter:image" content="${defaultAbsImage}" />`
            );
        }

        res
          .setHeader('Content-Type', 'text/html; charset=utf-8')
          .setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
          .send(html);
      } catch {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(distIndexPath);
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`AZ FILMS server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
