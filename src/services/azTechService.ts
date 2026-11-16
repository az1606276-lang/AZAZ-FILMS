import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { saveFilm } from './filmService';
import { saveSiteSettings } from './siteSettingsService';
import type { Film, SiteAccessMode, SiteSettings } from '../types/cinema';

export type AzTechActionType = 'link_update' | 'batch_repair' | 'maintenance_mode' | 'cache_sync';

export interface AzTechOrder {
  orderId: string;
  actionType: AzTechActionType;
  targetFilmId?: string;
  requestNote: string;
  resolutionNote: string;
  status: 'resolved' | 'warning';
  checkedLinks: number;
  updatedLinks: number;
  latencyMs: number;
  createdByEmail: string;
  createdAt: Date;
}

export interface AzTechServerStatus {
  status: string;
  service: string;
  nodeVersion: string;
  uptimeSec: number;
  memoryMb: number;
  localAssetsCount: number;
  uploadsCount: number;
  serverTimeIso: string;
}

export interface AzTechProbeTarget {
  id: string;
  filmId?: string;
  field: 'videoUrl' | 'trailerUrl' | 'posterUrl' | 'backdropUrl' | 'siteUrl';
  label: string;
  url: string;
}

export interface AzTechProbeResult {
  id: string;
  filmId?: string;
  field: string;
  label: string;
  url: string;
  suggestedUrl: string | null;
  ok: boolean;
  status: number;
  contentType: string;
  sizeBytes: number;
  latencyMs: number;
  issue: string | null;
  devOnlyUpload: boolean;
}

export function normalizeCloudMediaUrl(rawUrl: string): {
  normalized: string;
  changed: boolean;
  provider: 'local' | 'gdrive' | 'dropbox' | 'github' | 'youtube' | 'direct';
  noteAr: string;
  noteEn: string;
} {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      normalized: '',
      changed: false,
      provider: 'direct',
      noteAr: '',
      noteEn: '',
    };
  }
  if (trimmed.startsWith('/')) {
    return {
      normalized: trimmed,
      changed: trimmed !== rawUrl,
      provider: 'local',
      noteAr: trimmed.startsWith('/uploads/')
        ? 'ملف مرفوع مؤقتًا على خادم التطوير'
        : 'مسار استوديو مدمج في المنصة',
      noteEn: trimmed.startsWith('/uploads/') ? 'Dev server upload' : 'Studio bundled path',
    };
  }

  let next = trimmed;
  let provider: 'local' | 'gdrive' | 'dropbox' | 'github' | 'youtube' | 'direct' = 'direct';
  const notesAr: string[] = [];
  const notesEn: string[] = [];

  if (/^http:\/\//i.test(next) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(next)) {
    next = next.replace(/^http:\/\//i, 'https://');
    notesAr.push('ترقية البروتوكول إلى HTTPS');
    notesEn.push('Upgraded to HTTPS');
  }

  const driveOpen = next.match(/drive\.google\.com\/(?:open\?id=|uc\?(?:[^#]*&)?id=)([a-zA-Z0-9_-]+)/i);
  const driveFile = next.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (driveOpen) {
    provider = 'gdrive';
    next = `https://drive.google.com/file/d/${driveOpen[1]}/view`;
    notesAr.push('تحويل رابط Google Drive إلى صيغة البث المتوافقة');
    notesEn.push('Normalized Google Drive stream URL');
  } else if (driveFile) {
    provider = 'gdrive';
    const cleanDrive = `https://drive.google.com/file/d/${driveFile[1]}/view`;
    if (next !== cleanDrive && !next.endsWith('/preview')) {
      next = cleanDrive;
      notesAr.push('تنظيف معلمات رابط Google Drive');
      notesEn.push('Cleaned Google Drive query params');
    }
  } else if (/dropbox\.com/i.test(next)) {
    provider = 'dropbox';
    if (/[?&]dl=[01]/.test(next)) {
      next = next.replace(/([?&])dl=[01]/, '$1raw=1');
      notesAr.push('تحويل Dropbox للبث المباشر raw=1');
      notesEn.push('Converted Dropbox dl flag to raw=1');
    } else if (!/[?&]raw=1/.test(next)) {
      next = `${next}${next.includes('?') ? '&' : '?'}raw=1`;
      notesAr.push('تفعيل البث المباشر على Dropbox');
      notesEn.push('Enabled direct Dropbox streaming');
    }
  } else {
    const ghBlob = next.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i);
    if (ghBlob) {
      provider = 'github';
      next = `https://raw.githubusercontent.com/${ghBlob[1]}/${ghBlob[2]}/${ghBlob[3]}`;
      notesAr.push('تحويل رابط GitHub إلى raw مباشر');
      notesEn.push('Converted GitHub blob URL to raw');
    } else if (/youtu\.be|youtube\.com/i.test(next)) {
      provider = 'youtube';
    }
  }

  return {
    normalized: next,
    changed: next !== trimmed,
    provider,
    noteAr: notesAr.join(' · ') || 'رابط سحابي جاهز',
    noteEn: notesEn.join(' · ') || 'Cloud stream ready',
  };
}

async function getAdminBearerToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Admin authentication required.');
  }
  return user.getIdToken();
}

export async function fetchAzTechServerStatus(): Promise<AzTechServerStatus> {
  try {
    const token = await getAdminBearerToken();
    const resp = await fetch('/api/az-tech/status', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ct = resp.headers.get('content-type') || '';
    if (!resp.ok || !ct.includes('application/json')) {
      throw new Error(`Status check unavailable (${resp.status})`);
    }
    return await resp.json();
  } catch {
    return {
      status: 'cloud-static',
      service: 'az-tech-center-cloud',
      nodeVersion: 'cloud',
      uptimeSec: 0,
      memoryMb: 0,
      localAssetsCount: 0,
      uploadsCount: 0,
      serverTimeIso: new Date().toISOString(),
    };
  }
}

async function clientFallbackProbe(
  targets: AzTechProbeTarget[]
): Promise<{ checkedAtIso: string; results: AzTechProbeResult[] }> {
  const results = await Promise.all(
    targets.map(async (target): Promise<AzTechProbeResult> => {
      const startedAt = Date.now();
      const url = target.url.trim();
      const norm = normalizeCloudMediaUrl(url);
      const suggestedUrl = norm.changed ? norm.normalized : null;

      if (!url) {
        return {
          id: target.id,
          filmId: target.filmId,
          field: target.field,
          label: target.label,
          url,
          suggestedUrl: null,
          ok: false,
          status: 0,
          contentType: '',
          sizeBytes: 0,
          latencyMs: Date.now() - startedAt,
          issue: 'empty',
          devOnlyUpload: false,
        };
      }

      if (url.startsWith('/uploads/')) {
        return {
          id: target.id,
          filmId: target.filmId,
          field: target.field,
          label: target.label,
          url,
          suggestedUrl: null,
          ok: false,
          status: 404,
          contentType: '',
          sizeBytes: 0,
          latencyMs: Date.now() - startedAt,
          issue: 'dev_only_upload',
          devOnlyUpload: true,
        };
      }

      if (url.startsWith('/')) {
        try {
          const resp = await fetch(url, { method: 'HEAD', cache: 'no-store' });
          return {
            id: target.id,
            filmId: target.filmId,
            field: target.field,
            label: target.label,
            url,
            suggestedUrl: null,
            ok: resp.ok,
            status: resp.status,
            contentType: resp.headers.get('content-type') || '',
            sizeBytes: Number(resp.headers.get('content-length') || 0) || 0,
            latencyMs: Date.now() - startedAt,
            issue: resp.ok ? null : `http_${resp.status}`,
            devOnlyUpload: false,
          };
        } catch {
          return {
            id: target.id,
            filmId: target.filmId,
            field: target.field,
            label: target.label,
            url,
            suggestedUrl: null,
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

      try {
        await fetch(suggestedUrl || url, {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-store',
          signal: AbortSignal.timeout(4500),
        });
        return {
          id: target.id,
          filmId: target.filmId,
          field: target.field,
          label: target.label,
          url,
          suggestedUrl,
          ok: true,
          status: 200,
          contentType: 'cloud/stream',
          sizeBytes: 0,
          latencyMs: Date.now() - startedAt,
          issue: suggestedUrl ? 'can_optimize' : null,
          devOnlyUpload: false,
        };
      } catch {
        return {
          id: target.id,
          filmId: target.filmId,
          field: target.field,
          label: target.label,
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
    })
  );

  return { checkedAtIso: new Date().toISOString(), results };
}

export async function probeAzTechLinks(
  targets: AzTechProbeTarget[]
): Promise<{ checkedAtIso: string; results: AzTechProbeResult[] }> {
  try {
    const token = await getAdminBearerToken();
    const resp = await fetch('/api/az-tech/probe-links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ targets }),
    });
    const ct = resp.headers.get('content-type') || '';
    if (!resp.ok || !ct.includes('application/json')) {
      return await clientFallbackProbe(targets);
    }
    return await resp.json();
  } catch {
    return await clientFallbackProbe(targets);
  }
}

export async function createAzTechOrder(params: {
  actionType: AzTechActionType;
  targetFilmId?: string;
  requestNote: string;
  resolutionNote: string;
  status: 'resolved' | 'warning';
  checkedLinks: number;
  updatedLinks: number;
  latencyMs: number;
}): Promise<string> {
  const orderId = `azt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const email = auth.currentUser?.email || 'az1606276@gmail.com';
  const payload: Record<string, unknown> = {
    orderId,
    actionType: params.actionType,
    requestNote: params.requestNote.trim().slice(0, 500) || 'AZ Tech Maintenance Request',
    resolutionNote: params.resolutionNote.trim().slice(0, 800) || 'Processed automatically',
    status: params.status,
    checkedLinks: Math.max(0, Math.min(500, Math.round(params.checkedLinks))),
    updatedLinks: Math.max(0, Math.min(500, Math.round(params.updatedLinks))),
    latencyMs: Math.max(0, Math.min(60000, Math.round(params.latencyMs))),
    createdByEmail: email.slice(0, 320),
    createdAt: serverTimestamp(),
  };
  if (params.targetFilmId && params.targetFilmId.trim()) {
    payload.targetFilmId = params.targetFilmId.trim().slice(0, 128);
  }

  try {
    await setDoc(doc(db, 'az_tech_orders', orderId), payload);
    return orderId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `az_tech_orders/${orderId}`);
  }
}

export function subscribeAzTechOrders(
  onUpdate: (orders: AzTechOrder[]) => void
): Unsubscribe {
  const q = query(collection(db, 'az_tech_orders'), orderBy('createdAt', 'desc'), limit(25));
  return onSnapshot(
    q,
    (snap) => {
      const items: AzTechOrder[] = snap.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        const ts = raw.createdAt as { toDate?: () => Date } | undefined;
        return {
          orderId: String(raw.orderId || d.id),
          actionType: (raw.actionType as AzTechActionType) || 'link_update',
          targetFilmId: typeof raw.targetFilmId === 'string' ? raw.targetFilmId : undefined,
          requestNote: String(raw.requestNote || ''),
          resolutionNote: String(raw.resolutionNote || ''),
          status: raw.status === 'warning' ? 'warning' : 'resolved',
          checkedLinks: Number(raw.checkedLinks || 0),
          updatedLinks: Number(raw.updatedLinks || 0),
          latencyMs: Number(raw.latencyMs || 0),
          createdByEmail: String(raw.createdByEmail || ''),
          createdAt: ts && typeof ts.toDate === 'function' ? ts.toDate() : new Date(),
        };
      });
      onUpdate(items);
    },
    (error) => {
      console.warn('AZ Tech orders listener error:', error);
    }
  );
}

export async function deleteAzTechOrder(orderId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'az_tech_orders', orderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `az_tech_orders/${orderId}`);
  }
}

export async function purgeCachesAndSyncServer(currentSettings: SiteSettings): Promise<{
  cachesCleared: number;
  swUpdated: boolean;
}> {
  let cachesCleared = 0;
  let swUpdated = false;

  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((k) => window.caches.delete(k)));
      cachesCleared = keys.length;
    } catch {
      // Ignore restricted cache API
    }
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update()));
      swUpdated = regs.length > 0;
    } catch {
      // Ignore SW update errors
    }
  }

  // Force live server read & stamp updatedAt on platform settings so active clients pull latest revision
  await Promise.all([
    getDocFromServer(doc(db, 'site_settings', 'platform')).catch(() => null),
    getDocsFromServer(query(collection(db, 'films'), where('isVisible', '==', true))).catch(() => null),
    saveSiteSettings({
      accessMode: currentSettings.accessMode,
      statusTitleAr: currentSettings.statusTitleAr,
      statusTitleEn: currentSettings.statusTitleEn,
      statusMessageAr: currentSettings.statusMessageAr,
      statusMessageEn: currentSettings.statusMessageEn,
      announcementEnabled: currentSettings.announcementEnabled,
      announcementAr: currentSettings.announcementAr,
      announcementEn: currentSettings.announcementEn,
      instagramUrl: currentSettings.instagramUrl,
      onlyShowReadyFilms: Boolean(currentSettings.onlyShowReadyFilms),
      countdownEnabled: Boolean(currentSettings.countdownEnabled),
      countdownTargetIso: currentSettings.countdownTargetIso || '',
      countdownTitleAr: currentSettings.countdownTitleAr || '',
      countdownTitleEn: currentSettings.countdownTitleEn || '',
      pollEnabled: currentSettings.pollEnabled !== false,
      pollId: currentSettings.pollId || 'poll-v1',
      pollQuestionAr: currentSettings.pollQuestionAr || '',
      pollQuestionEn: currentSettings.pollQuestionEn || '',
      pollOptionAAr: currentSettings.pollOptionAAr || '',
      pollOptionAEn: currentSettings.pollOptionAEn || '',
      pollOptionBAr: currentSettings.pollOptionBAr || '',
      pollOptionBEn: currentSettings.pollOptionBEn || '',
    }),
  ]);

  return { cachesCleared, swUpdated };
}

export async function executeBatchLinkRepair(films: Film[]): Promise<{
  checkedLinks: number;
  updatedFilms: number;
  brokenCount: number;
  probeResults: AzTechProbeResult[];
}> {
  const targets: AzTechProbeTarget[] = [];
  for (const film of films) {
    if (film.videoUrl?.trim()) {
      targets.push({
        id: `${film.id}:videoUrl`,
        filmId: film.id,
        field: 'videoUrl',
        label: `${film.titleAr} — الفيديو الكامل`,
        url: film.videoUrl.trim(),
      });
    }
    if (film.trailerUrl?.trim()) {
      targets.push({
        id: `${film.id}:trailerUrl`,
        filmId: film.id,
        field: 'trailerUrl',
        label: `${film.titleAr} — التريلر`,
        url: film.trailerUrl.trim(),
      });
    }
    if (film.posterUrl?.trim() && !film.posterUrl.startsWith('data:')) {
      targets.push({
        id: `${film.id}:posterUrl`,
        filmId: film.id,
        field: 'posterUrl',
        label: `${film.titleAr} — البوستر`,
        url: film.posterUrl.trim(),
      });
    }
  }

  const probe = targets.length > 0 ? await probeAzTechLinks(targets) : { checkedAtIso: '', results: [] };
  let updatedFilms = 0;

  for (const film of films) {
    const vNorm = normalizeCloudMediaUrl(film.videoUrl || '');
    const tNorm = normalizeCloudMediaUrl(film.trailerUrl || '');
    const pNorm = normalizeCloudMediaUrl(film.posterUrl || '');
    const bNorm = normalizeCloudMediaUrl(film.backdropUrl || '');

    const primaryStream = vNorm.normalized || tNorm.normalized;
    const existingQualities = film.videoQualities || [];
    const has4kTier = existingQualities.some(
      (q) => /4k|2160|uhd/i.test(q.label) && q.url === primaryStream
    );

    const needsVideo4kSync = Boolean(primaryStream) && !has4kTier;
    const anyUrlNormalized = vNorm.changed || tNorm.changed || pNorm.changed || bNorm.changed;

    if (anyUrlNormalized || needsVideo4kSync) {
      const nextQualities = primaryStream
        ? [
            { label: '4K UHD (2160p)', url: primaryStream },
            ...existingQualities.filter(
              (q) => q.url !== primaryStream && !/4k|2160|uhd/i.test(q.label)
            ),
          ].slice(0, 6)
        : existingQualities;

      await saveFilm(
        {
          id: film.id,
          titleAr: film.titleAr,
          titleEn: film.titleEn,
          year: film.year,
          releaseDate: film.releaseDate || '',
          genre: film.genre,
          duration: film.duration || '',
          durationSeconds: film.durationSeconds || 0,
          status: film.status,
          isOriginal: film.isOriginal,
          isFeatured: film.isFeatured,
          isVisible: film.isVisible,
          sortOrder: film.sortOrder,
          synopsisAr: film.synopsisAr || '',
          synopsisEn: film.synopsisEn || '',
          director: film.director || '',
          producers: film.producers || '',
          cast: film.cast || [],
          posterUrl: pNorm.normalized || film.posterUrl || '',
          backdropUrl: bNorm.normalized || film.backdropUrl || '',
          stillUrls: film.stillUrls || [],
          trailerUrl: tNorm.normalized || film.trailerUrl || '',
          videoUrl: vNorm.normalized || film.videoUrl || '',
          videoQualities: nextQualities,
        },
        false,
        films
      );
      updatedFilms += 1;
    }
  }

  const brokenCount = probe.results.filter((r) => !r.ok || r.devOnlyUpload).length;
  return {
    checkedLinks: probe.results.length,
    updatedFilms,
    brokenCount,
    probeResults: probe.results,
  };
}

export async function executeDirectLinkUpdate(params: {
  films: Film[];
  filmId: string;
  field: 'videoUrl' | 'trailerUrl' | 'posterUrl' | 'backdropUrl';
  newUrl: string;
  directiveNote: string;
}): Promise<{
  film: Film;
  normalizedUrl: string;
  probe: AzTechProbeResult | null;
}> {
  const film = params.films.find((f) => f.id === params.filmId);
  if (!film) {
    throw new Error('Selected film was not found.');
  }

  const norm = normalizeCloudMediaUrl(params.newUrl);
  const finalUrl = norm.normalized;
  if (!finalUrl) {
    throw new Error('Link cannot be empty.');
  }

  const probeResp = await probeAzTechLinks([
    {
      id: `${film.id}:${params.field}`,
      filmId: film.id,
      field: params.field,
      label: film.titleAr,
      url: finalUrl,
    },
  ]);
  const probe = probeResp.results[0] || null;

  const updatedFilmPayload = {
    id: film.id,
    titleAr: film.titleAr,
    titleEn: film.titleEn,
    year: film.year,
    releaseDate: film.releaseDate || '',
    genre: film.genre,
    duration: film.duration || '',
    durationSeconds: film.durationSeconds || 0,
    status: film.status,
    isOriginal: film.isOriginal,
    isFeatured: film.isFeatured,
    isVisible: film.isVisible,
    sortOrder: film.sortOrder,
    synopsisAr: film.synopsisAr || '',
    synopsisEn: film.synopsisEn || '',
    director: film.director || '',
    producers: film.producers || '',
    cast: film.cast || [],
    posterUrl: params.field === 'posterUrl' ? finalUrl : film.posterUrl || '',
    backdropUrl: params.field === 'backdropUrl' ? finalUrl : film.backdropUrl || '',
    stillUrls: film.stillUrls || [],
    trailerUrl: params.field === 'trailerUrl' ? finalUrl : film.trailerUrl || '',
    videoUrl: params.field === 'videoUrl' ? finalUrl : film.videoUrl || '',
    videoQualities:
      params.field === 'videoUrl'
        ? [
            { label: '4K UHD (2160p)', url: finalUrl },
            ...(film.videoQualities || []).filter(
              (q) => q.url !== finalUrl && !/4k|2160|uhd/i.test(q.label)
            ),
          ].slice(0, 6)
        : film.videoQualities || [],
  };

  await saveFilm(updatedFilmPayload, false, params.films);

  await createAzTechOrder({
    actionType: 'link_update',
    targetFilmId: film.id,
    requestNote: params.directiveNote.trim() || `تحديث ${params.field} لفيلم ${film.titleAr}`,
    resolutionNote: norm.changed
      ? `تمت معالجة الرابط وتطبيقه فورًا (${norm.noteAr}) وتحديث جودة 4K UHD`
      : `تم فحص الرابط (${probe?.status || 'LIVE'}) وتحديثه فورًا في قاعدة البيانات`,
    status: probe && (!probe.ok || probe.devOnlyUpload) ? 'warning' : 'resolved',
    checkedLinks: 1,
    updatedLinks: 1,
    latencyMs: probe?.latencyMs || 45,
  });

  return { film, normalizedUrl: finalUrl, probe };
}

export async function applyEmergencyMaintenanceMode(
  currentSettings: SiteSettings,
  targetMode: SiteAccessMode,
  customNote?: string
): Promise<void> {
  const startedAt = Date.now();
  await saveSiteSettings({
    accessMode: targetMode,
    statusTitleAr:
      targetMode === 'maintenance'
        ? 'صيانة تقنية عاجلة — مركز AZ التقني'
        : targetMode === 'closed'
          ? 'المنصة مغلقة مؤقتًا للتحديث'
          : currentSettings.statusTitleAr,
    statusTitleEn:
      targetMode === 'maintenance'
        ? 'Instant Maintenance — AZ Tech Center'
        : targetMode === 'closed'
          ? 'Platform Temporarily Closed'
          : currentSettings.statusTitleEn,
    statusMessageAr:
      customNote?.trim() && targetMode !== 'open'
        ? customNote.trim()
        : targetMode === 'maintenance'
          ? 'يقوم مركز AZ التقني حاليًا بتحديث الروابط السحابية وتحسين جودة البث 4K. نعود إليكم فورًا.'
          : currentSettings.statusMessageAr,
    statusMessageEn:
      targetMode === 'maintenance'
        ? 'AZ Tech Center is upgrading cloud streaming links and 4K UHD delivery. Returning shortly.'
        : currentSettings.statusMessageEn,
    announcementEnabled: currentSettings.announcementEnabled,
    announcementAr: currentSettings.announcementAr,
    announcementEn: currentSettings.announcementEn,
    instagramUrl: currentSettings.instagramUrl,
    onlyShowReadyFilms: Boolean(currentSettings.onlyShowReadyFilms),
    countdownEnabled: Boolean(currentSettings.countdownEnabled),
    countdownTargetIso: currentSettings.countdownTargetIso || '',
    countdownTitleAr: currentSettings.countdownTitleAr || '',
    countdownTitleEn: currentSettings.countdownTitleEn || '',
    pollEnabled: currentSettings.pollEnabled !== false,
    pollId: currentSettings.pollId || 'poll-v1',
    pollQuestionAr: currentSettings.pollQuestionAr || '',
    pollQuestionEn: currentSettings.pollQuestionEn || '',
    pollOptionAAr: currentSettings.pollOptionAAr || '',
    pollOptionAEn: currentSettings.pollOptionAEn || '',
    pollOptionBAr: currentSettings.pollOptionBAr || '',
    pollOptionBEn: currentSettings.pollOptionBEn || '',
  });

  await createAzTechOrder({
    actionType: 'maintenance_mode',
    requestNote:
      customNote?.trim() ||
      (targetMode === 'open'
        ? 'طلب إعادة فتح البث المباشر'
        : `تفعيل حالة ${targetMode.toUpperCase()} عبر مركز AZ التقني`),
    resolutionNote:
      targetMode === 'open'
        ? 'تم فتح الموقع للزوار وإعادة البث المباشر على الرابط الثابت فورًا'
        : `تم تحويل الموقع فورًا إلى وضع ${targetMode === 'maintenance' ? 'الصيانة التقنية' : 'الإغلاق المؤقت'} مع بقاء صلاحية المالك`,
    status: 'resolved',
    checkedLinks: 1,
    updatedLinks: 1,
    latencyMs: Date.now() - startedAt,
  });
}
