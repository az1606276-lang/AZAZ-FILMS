import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { CANONICAL_FILMS } from '../data/canonicalFilms';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { Film, FilmGenre, FilmStatus } from '../types/cinema';

const ALLOWED_GENRES: FilmGenre[] = ['military', 'historical', 'drama', 'action', 'thriller', 'other'];
const ALLOWED_STATUSES: FilmStatus[] = ['released', 'coming_soon', 'post_production'];

function normalizeFilmDoc(id: string, data: Record<string, unknown>): Film {
  const genre = ALLOWED_GENRES.includes(data.genre as FilmGenre) ? (data.genre as FilmGenre) : 'drama';
  const status = ALLOWED_STATUSES.includes(data.status as FilmStatus) ? (data.status as FilmStatus) : 'released';
  const canonicalFallback = CANONICAL_FILMS.find((f) => f.id === id);

  const rawVideoUrl = typeof data.videoUrl === 'string' ? data.videoUrl : '';
  const resolvedVideoUrl =
    canonicalFallback?.videoUrl && (!rawVideoUrl || rawVideoUrl.startsWith('/uploads/'))
      ? canonicalFallback.videoUrl
      : rawVideoUrl;
  const rawPosterUrl = typeof data.posterUrl === 'string' ? data.posterUrl : '';
  const resolvedPosterUrl =
    canonicalFallback?.posterUrl && (!rawPosterUrl || rawPosterUrl.startsWith('/uploads/'))
      ? canonicalFallback.posterUrl
      : rawPosterUrl;
  const rawBackdropUrl = typeof data.backdropUrl === 'string' ? data.backdropUrl : '';
  const resolvedBackdropUrl =
    canonicalFallback?.backdropUrl && (!rawBackdropUrl || rawBackdropUrl.startsWith('/uploads/'))
      ? canonicalFallback.backdropUrl
      : rawBackdropUrl;

  const rawDuration = typeof data.duration === 'string' ? data.duration : '';
  const resolvedDuration =
    canonicalFallback?.duration && canonicalFallback.duration !== '—' && (!rawDuration || rawDuration === '—')
      ? canonicalFallback.duration
      : rawDuration;
  const rawDurationSec = Number(data.durationSeconds || 0);
  const resolvedDurationSec =
    canonicalFallback?.durationSeconds && !rawDurationSec ? canonicalFallback.durationSeconds : rawDurationSec;

  const isOldLastOpPlaceholder =
    id === 'the-last-operation' &&
    Boolean(canonicalFallback) &&
    (!rawVideoUrl || rawVideoUrl.startsWith('/uploads/')) &&
    (status === 'coming_soon' ||
      data.synopsisAr === 'إنتاج عسكري مرتقب من AZ ORIGINALS في مرحلة التحضير للإطلاق الرسمي.');

  const resolvedStatus = isOldLastOpPlaceholder && canonicalFallback ? canonicalFallback.status : status;
  const resolvedGenre = isOldLastOpPlaceholder && canonicalFallback ? canonicalFallback.genre : genre;
  const resolvedSynopsisAr =
    isOldLastOpPlaceholder && canonicalFallback?.synopsisAr
      ? canonicalFallback.synopsisAr
      : typeof data.synopsisAr === 'string'
      ? data.synopsisAr
      : '';
  const resolvedSynopsisEn =
    isOldLastOpPlaceholder && canonicalFallback?.synopsisEn
      ? canonicalFallback.synopsisEn
      : typeof data.synopsisEn === 'string'
      ? data.synopsisEn
      : '';
  const rawTrailerUrl = typeof data.trailerUrl === 'string' ? data.trailerUrl : '';
  const resolvedTrailerUrl =
    canonicalFallback?.trailerUrl && (!rawTrailerUrl || rawTrailerUrl.startsWith('/uploads/'))
      ? canonicalFallback.trailerUrl
      : rawTrailerUrl;

  const isFathersSinPlaceholder =
    id === 'fathers-sin' &&
    Boolean(canonicalFallback) &&
    (!data.director || data.director === 'AZ FILMS STUDIO');

  const resolvedDirector =
    (isOldLastOpPlaceholder || isFathersSinPlaceholder) && canonicalFallback?.director
      ? canonicalFallback.director
      : typeof data.director === 'string'
      ? data.director
      : '';
  const resolvedProducers =
    (isOldLastOpPlaceholder || isFathersSinPlaceholder) && canonicalFallback?.producers
      ? canonicalFallback.producers
      : typeof data.producers === 'string'
      ? data.producers
      : '';
  const rawCast = Array.isArray(data.cast)
    ? data.cast.map((c) => ({
        name: String((c as Record<string, unknown>)?.name || ''),
        role: String((c as Record<string, unknown>)?.role || ''),
      }))
    : [];
  const resolvedCast =
    (isOldLastOpPlaceholder || isFathersSinPlaceholder) &&
    canonicalFallback?.cast &&
    rawCast.length === 0
      ? canonicalFallback.cast
      : rawCast;

  return {
    id,
    titleAr: String(data.titleAr || ''),
    titleEn: String(data.titleEn || ''),
    year: Number(data.year || 2025),
    releaseDate: typeof data.releaseDate === 'string' ? data.releaseDate : '',
    genre: resolvedGenre,
    duration: resolvedDuration,
    durationSeconds: resolvedDurationSec,
    status: resolvedStatus,
    isOriginal: Boolean(data.isOriginal),
    isFeatured: Boolean(data.isFeatured),
    isVisible: data.isVisible !== false,
    sortOrder: Number(data.sortOrder || 0),
    synopsisAr: resolvedSynopsisAr,
    synopsisEn: resolvedSynopsisEn,
    director: resolvedDirector,
    producers: resolvedProducers,
    cast: resolvedCast,
    posterUrl: resolvedPosterUrl,
    backdropUrl: resolvedBackdropUrl,
    stillUrls: Array.isArray(data.stillUrls) ? data.stillUrls.map(String) : [],
    trailerUrl: resolvedTrailerUrl,
    videoUrl: resolvedVideoUrl,
    videoQualities:
      Array.isArray(data.videoQualities) && data.videoQualities.length > 0
        ? data.videoQualities.map((q) => ({
            label: String((q as Record<string, unknown>)?.label || ''),
            url: String((q as Record<string, unknown>)?.url || ''),
          }))
        : resolvedVideoUrl
          ? [{ label: '4K UHD (2160p)', url: resolvedVideoUrl }]
          : canonicalFallback?.videoQualities || [],
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function subscribeFilms(
  isAdmin: boolean,
  onUpdate: (films: Film[], isFromFirestore: boolean) => void
): Unsubscribe {
  const filmsRef = collection(db, 'films');
  const q = isAdmin ? query(filmsRef) : query(filmsRef, where('isVisible', '==', true));
  let cancelled = false;
  let lastServerFetch = 0;

  const buildList = (docs: { id: string; data: () => Record<string, unknown> }[]) => {
    const list = docs.map((d) => normalizeFilmDoc(d.id, d.data()));
    const ensureIds = isAdmin
      ? CANONICAL_FILMS.map((f) => f.id)
      : ['az-the-last-road', 'the-last-operation'];
    for (const id of ensureIds) {
      if (!list.some((f) => f.id === id)) {
        const cf = CANONICAL_FILMS.find((f) => f.id === id);
        if (cf && (isAdmin || cf.isVisible)) {
          list.push(cf);
        }
      }
    }
    list.sort((a, b) => a.sortOrder - b.sortOrder || b.year - a.year);
    return list;
  };

  const refreshFilmsFromServer = () => {
    const now = Date.now();
    if (now - lastServerFetch < 12000) return;
    lastServerFetch = now;
    getDocsFromServer(q)
      .then((serverSnap) => {
        if (cancelled) return;
        if (serverSnap.empty && !isAdmin) {
          onUpdate([...CANONICAL_FILMS], false);
          return;
        }
        const list = buildList(
          serverSnap.docs as unknown as { id: string; data: () => Record<string, unknown> }[]
        );
        if (list.length === 0 && !isAdmin) {
          onUpdate([...CANONICAL_FILMS], false);
        } else {
          onUpdate(list, true);
        }
      })
      .catch(() => {
        // Ignore transient offline error; snapshot listener handles retry
      });
  };

  const onVisible = () => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      refreshFilmsFromServer();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
  }

  const unsubSnapshot = onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.metadata.fromCache) {
        refreshFilmsFromServer();
      }
      if (snapshot.empty && !isAdmin) {
        onUpdate([...CANONICAL_FILMS], false);
        return;
      }
      const list = buildList(
        snapshot.docs as unknown as { id: string; data: () => Record<string, unknown> }[]
      );
      if (list.length === 0 && !isAdmin) {
        onUpdate([...CANONICAL_FILMS], false);
      } else {
        onUpdate(list, true);
      }
    },
    (error) => {
      console.error('Firestore films subscription error:', error);
      onUpdate([...CANONICAL_FILMS], false);
    }
  );

  return () => {
    cancelled = true;
    unsubSnapshot();
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
}

export async function seedCanonicalFilmsIfNeeded(): Promise<void> {
  try {
    const snap = await getDocs(collection(db, 'films'));
    const existingMap = new Map(snap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
    const missing = CANONICAL_FILMS.filter((f) => !existingMap.has(f.id));
    const canonicalTree = CANONICAL_FILMS.find((f) => f.id === 'the-tree');
    const existingTree = existingMap.get('the-tree');
    const treeUpdates: Record<string, unknown> = {};
    if (existingTree && canonicalTree) {
      if (!existingTree.posterUrl && canonicalTree.posterUrl) {
        treeUpdates.posterUrl = canonicalTree.posterUrl;
      }
      if (!existingTree.backdropUrl && canonicalTree.backdropUrl) {
        treeUpdates.backdropUrl = canonicalTree.backdropUrl;
      }
      if (
        !existingTree.synopsisAr ||
        existingTree.synopsisAr === 'حكاية تاريخية ورمزية من إنتاج AZ ORIGINALS تبحث في الجذور والذاكرة والمكان.'
      ) {
        treeUpdates.synopsisAr = canonicalTree.synopsisAr;
        treeUpdates.synopsisEn = canonicalTree.synopsisEn;
      }
      if (
        canonicalTree.videoUrl &&
        (!existingTree.videoUrl || String(existingTree.videoUrl).startsWith('/uploads/'))
      ) {
        treeUpdates.videoUrl = canonicalTree.videoUrl;
        treeUpdates.duration = canonicalTree.duration;
        treeUpdates.durationSeconds = canonicalTree.durationSeconds;
      }
      if (!existingTree.director || existingTree.director === 'AZ FILMS STUDIO') {
        treeUpdates.director = canonicalTree.director;
        treeUpdates.producers = canonicalTree.producers;
      }
    }
    const canonicalLastOp = CANONICAL_FILMS.find((f) => f.id === 'the-last-operation');
    const existingLastOp = existingMap.get('the-last-operation');
    const lastOpUpdates: Record<string, unknown> = {};
    if (existingLastOp && canonicalLastOp) {
      if (!existingLastOp.posterUrl && canonicalLastOp.posterUrl) {
        lastOpUpdates.posterUrl = canonicalLastOp.posterUrl;
      }
      if (!existingLastOp.backdropUrl && canonicalLastOp.backdropUrl) {
        lastOpUpdates.backdropUrl = canonicalLastOp.backdropUrl;
      }
      if (
        !existingLastOp.synopsisAr ||
        existingLastOp.synopsisAr === 'إنتاج عسكري مرتقب من AZ ORIGINALS في مرحلة التحضير للإطلاق الرسمي.'
      ) {
        lastOpUpdates.synopsisAr = canonicalLastOp.synopsisAr;
        lastOpUpdates.synopsisEn = canonicalLastOp.synopsisEn;
      }
      if (
        canonicalLastOp.videoUrl &&
        (!existingLastOp.videoUrl || String(existingLastOp.videoUrl).startsWith('/uploads/'))
      ) {
        lastOpUpdates.videoUrl = canonicalLastOp.videoUrl;
        lastOpUpdates.duration = canonicalLastOp.duration;
        lastOpUpdates.durationSeconds = canonicalLastOp.durationSeconds;
        lastOpUpdates.status = canonicalLastOp.status;
        lastOpUpdates.genre = canonicalLastOp.genre;
      }
      if (!existingLastOp.director || existingLastOp.director === 'AZ FILMS STUDIO') {
        lastOpUpdates.director = canonicalLastOp.director;
        lastOpUpdates.producers = canonicalLastOp.producers;
      }
      if (!Array.isArray(existingLastOp.cast) || existingLastOp.cast.length === 0) {
        lastOpUpdates.cast = canonicalLastOp.cast;
      }
    }

    const canonicalFathersSin = CANONICAL_FILMS.find((f) => f.id === 'fathers-sin');
    const existingFathersSin = existingMap.get('fathers-sin');
    const fathersSinUpdates: Record<string, unknown> = {};
    if (existingFathersSin && canonicalFathersSin) {
      if (
        canonicalFathersSin.trailerUrl &&
        (!existingFathersSin.trailerUrl ||
          String(existingFathersSin.trailerUrl).startsWith('/uploads/'))
      ) {
        fathersSinUpdates.trailerUrl = canonicalFathersSin.trailerUrl;
      }
      if (!existingFathersSin.director || existingFathersSin.director === 'AZ FILMS STUDIO') {
        fathersSinUpdates.director = canonicalFathersSin.director;
        fathersSinUpdates.producers = canonicalFathersSin.producers;
      }
      if (!Array.isArray(existingFathersSin.cast) || existingFathersSin.cast.length === 0) {
        fathersSinUpdates.cast = canonicalFathersSin.cast;
      }
    }

    const needsTreeUpdate = Object.keys(treeUpdates).length > 0;
    const needsLastOpUpdate = Object.keys(lastOpUpdates).length > 0;
    const needsFathersSinUpdate = Object.keys(fathersSinUpdates).length > 0;
    if (missing.length === 0 && !needsTreeUpdate && !needsLastOpUpdate && !needsFathersSinUpdate) return;

    const batch = writeBatch(db);
    for (const film of missing) {
      const ref = doc(db, 'films', film.id);
      batch.set(ref, {
        ...film,
        year: Math.round(film.year),
        sortOrder: Math.round(film.sortOrder),
        durationSeconds: Math.round(film.durationSeconds || 0),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    if (needsTreeUpdate) {
      batch.update(doc(db, 'films', 'the-tree'), {
        ...treeUpdates,
        updatedAt: serverTimestamp(),
      });
    }
    if (needsLastOpUpdate) {
      batch.update(doc(db, 'films', 'the-last-operation'), {
        ...lastOpUpdates,
        updatedAt: serverTimestamp(),
      });
    }
    if (needsFathersSinUpdate) {
      batch.update(doc(db, 'films', 'fathers-sin'), {
        ...fathersSinUpdates,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'films');
  }
}

export function sanitizeFilmId(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || `film-${Date.now()}`;
}

export async function saveFilm(
  input: Omit<Film, 'createdAt' | 'updatedAt'>,
  isNew: boolean,
  existingFilms: Film[]
): Promise<void> {
  const safeId = sanitizeFilmId(input.id || input.titleEn || `film-${Date.now()}`);
  const payload = {
    id: safeId,
    titleAr: input.titleAr.trim().slice(0, 200),
    titleEn: input.titleEn.trim().slice(0, 200),
    year: Math.min(2100, Math.max(1900, Math.round(Number(input.year) || 2025))),
    releaseDate: (input.releaseDate || '').trim().slice(0, 64),
    genre: ALLOWED_GENRES.includes(input.genre) ? input.genre : 'drama',
    duration: (input.duration || '').trim().slice(0, 40),
    durationSeconds: Math.min(86400, Math.max(0, Math.round(Number(input.durationSeconds) || 0))),
    status: ALLOWED_STATUSES.includes(input.status) ? input.status : 'released',
    isOriginal: Boolean(input.isOriginal),
    isFeatured: Boolean(input.isFeatured),
    isVisible: Boolean(input.isVisible),
    sortOrder: Math.min(100000, Math.max(0, Math.round(Number(input.sortOrder) || 0))),
    synopsisAr: (input.synopsisAr || '').trim().slice(0, 4000),
    synopsisEn: (input.synopsisEn || '').trim().slice(0, 4000),
    director: (input.director || '').trim().slice(0, 200),
    producers: (input.producers || '').trim().slice(0, 400),
    cast: (input.cast || [])
      .filter((c) => c.name.trim().length > 0)
      .slice(0, 30)
      .map((c) => ({ name: c.name.trim().slice(0, 120), role: c.role.trim().slice(0, 120) })),
    posterUrl: (input.posterUrl || '').trim().slice(0, 350000),
    backdropUrl: (input.backdropUrl || '').trim().slice(0, 350000),
    stillUrls: (input.stillUrls || [])
      .filter((u) => u.trim().length > 0)
      .slice(0, 12)
      .map((u) => u.trim().slice(0, 150000)),
    trailerUrl: (input.trailerUrl || '').trim().slice(0, 4000),
    videoUrl: (input.videoUrl || '').trim().slice(0, 4000),
    videoQualities: (input.videoQualities || [])
      .filter((q) => q.label.trim().length > 0 && q.url.trim().length > 0)
      .slice(0, 6)
      .map((q) => ({ label: q.label.trim().slice(0, 40), url: q.url.trim().slice(0, 4000) })),
  };

  try {
    const targetRef = doc(db, 'films', safeId);
    const existingSnap = await getDoc(targetRef);
    const shouldCreate = isNew || !existingSnap.exists();

    const batch = writeBatch(db);
    if (payload.isFeatured) {
      for (const other of existingFilms) {
        if (other.id !== safeId && other.isFeatured) {
          const otherSnap = await getDoc(doc(db, 'films', other.id));
          if (otherSnap.exists()) {
            batch.update(doc(db, 'films', other.id), {
              isFeatured: false,
              updatedAt: serverTimestamp(),
            });
          }
        }
      }
    }

    if (shouldCreate) {
      batch.set(targetRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(targetRef, {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, `films/${safeId}`);
  }
}

export async function setFeaturedHeroFilm(filmId: string, allFilms: Film[]): Promise<void> {
  try {
    const batch = writeBatch(db);
    for (const f of allFilms) {
      if (f.id === filmId && !f.isFeatured) {
        batch.update(doc(db, 'films', f.id), { isFeatured: true, updatedAt: serverTimestamp() });
      } else if (f.id !== filmId && f.isFeatured) {
        batch.update(doc(db, 'films', f.id), { isFeatured: false, updatedAt: serverTimestamp() });
      }
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `films/${filmId}`);
  }
}

export async function toggleFilmVisibility(filmId: string, isVisible: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, 'films', filmId), {
      isVisible,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `films/${filmId}`);
  }
}

export async function updateFilmSortOrder(filmId: string, sortOrder: number): Promise<void> {
  try {
    await updateDoc(doc(db, 'films', filmId), {
      sortOrder: Math.min(100000, Math.max(0, Math.round(sortOrder))),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `films/${filmId}`);
  }
}

export async function deleteFilmById(filmId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'films', filmId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `films/${filmId}`);
  }
}

async function compressImageToDataUrl(file: File, maxDimension = 1200, maxLength = 240000): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format in browser.'));
      img.onload = () => {
        const ratio = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);

        for (const q of [0.85, 0.72, 0.58, 0.45]) {
          const out = canvas.toDataURL('image/webp', q);
          if (out.length <= maxLength) {
            resolve(out);
            return;
          }
          const jpg = canvas.toDataURL('image/jpeg', q);
          if (jpg.length <= maxLength) {
            resolve(jpg);
            return;
          }
        }
        resolve(canvas.toDataURL('image/jpeg', 0.35).slice(0, maxLength));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function uploadInChunks(
  file: File,
  category: 'trailers' | 'videos',
  token: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const initResp = await fetch('/api/upload/init', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ category, filename: file.name }),
  });
  const ct = initResp.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(
      'هذه الاستضافة مجانية للروابط السحابية فقط — أضف رابط الفيديو من Google Drive أو Dropbox في خانة الرابط وسيحوّله الموقع تلقائيًا.'
    );
  }
  const initData = await initResp.json();
  if (!initResp.ok || !initData.uploadId) {
    throw new Error(initData.error || 'Failed to initialize video upload.');
  }

  const chunkSize = 4 * 1024 * 1024; // 4MB chunks
  const totalChunks = Math.ceil(file.size / chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const chunkBlob = file.slice(start, end);
    const fd = new FormData();
    fd.append('chunk', chunkBlob, `part_${i}`);

    const chunkResp = await fetch(
      `/api/upload/chunk?uploadId=${encodeURIComponent(initData.uploadId)}&index=${i}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      }
    );
    if (!chunkResp.ok) {
      const errData = await chunkResp.json().catch(() => ({}));
      throw new Error(errData.error || `Chunk ${i + 1}/${totalChunks} failed.`);
    }
    if (onProgress) {
      onProgress(Math.round(((i + 1) / totalChunks) * 95));
    }
  }

  const completeResp = await fetch('/api/upload/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ uploadId: initData.uploadId, totalChunks }),
  });
  const completeData = await completeResp.json();
  if (!completeResp.ok || !completeData.url) {
    throw new Error(completeData.error || 'Failed to finalize video upload.');
  }
  if (onProgress) onProgress(100);
  return completeData.url;
}

export async function uploadMediaFile(
  file: File,
  category: 'posters' | 'backdrops' | 'stills' | 'trailers' | 'videos',
  onProgress?: (percent: number) => void
): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('يجب تسجيل الدخول بحساب الإدارة أولاً.');
  }
  const token = await user.getIdToken();
  const isImage = category === 'posters' || category === 'backdrops' || category === 'stills';
  const isVideo = category === 'trailers' || category === 'videos';

  if (isImage) {
    try {
      if (onProgress) onProgress(35);
      const maxDim = category === 'backdrops' ? 1280 : category === 'posters' ? 900 : 800;
      const maxLen = category === 'stills' ? 75000 : category === 'posters' ? 220000 : 240000;
      const compressed = await compressImageToDataUrl(file, maxDim, maxLen);
      if (onProgress) onProgress(100);
      return compressed;
    } catch {
      // Fallback to server upload if browser canvas cannot decode the image format
    }
  }

  if (isVideo && file.size > 8 * 1024 * 1024) {
    return uploadInChunks(file, category, token, onProgress);
  }

  return await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/upload?category=${encodeURIComponent(category)}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && onProgress) {
        onProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && parsed.url) {
          resolve(parsed.url);
        } else {
          reject(new Error(parsed.error || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(
          new Error(
            'هذه الاستضافة مجانية للروابط السحابية فقط — أضف رابط الفيديو من Google Drive أو Dropbox في خانة الرابط وسيحوّله الموقع تلقائيًا.'
          )
        );
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload.'));

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}
