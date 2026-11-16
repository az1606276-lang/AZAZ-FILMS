import {
  collection,
  doc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  AnalyticsDashboardReport,
  AnalyticsRangePreset,
  AnalyticsSession,
  AnalyticsView,
  AnalyticsVisit,
  Film,
  FilmAnalyticsSummary,
} from '../types/cinema';

const VISITOR_STORAGE_KEY = 'az_anon_visitor_id';
const VISITOR_REGISTERED_KEY = 'az_anon_visitor_registered';
const SESSION_VISIT_KEY = 'az_session_visit_id';

function randomSafeId(prefix: string): string {
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/[^a-zA-Z0-9_-]/g, '')
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${raw}`.slice(0, 120);
}

export function getDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getOrCreateVisitorId(): string {
  try {
    let existing = localStorage.getItem(VISITOR_STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9_-]{4,120}$/.test(existing)) {
      return existing;
    }
    existing = randomSafeId('vis');
    localStorage.setItem(VISITOR_STORAGE_KEY, existing);
    return existing;
  } catch {
    return randomSafeId('vis');
  }
}

export async function recordPlatformVisit(currentPath: string): Promise<void> {
  const visitorId = getOrCreateVisitorId();
  const safePath = (currentPath || '/').slice(0, 200);

  try {
    const alreadyRecordedVisitId = sessionStorage.getItem(SESSION_VISIT_KEY);
    if (alreadyRecordedVisitId) {
      // Same browser session (e.g. refresh): do not duplicate visit; just update active heartbeat
      await updateSessionHeartbeat(safePath);
      return;
    }

    const isReturning = localStorage.getItem(VISITOR_REGISTERED_KEY) === '1';
    const visitId = randomSafeId('vst');
    const dateKey = getDateKey();

    await setDoc(doc(db, 'analytics_visits', visitId), {
      visitId,
      visitorId,
      isReturning,
      dateKey,
      createdAt: serverTimestamp(),
    });

    sessionStorage.setItem(SESSION_VISIT_KEY, visitId);

    const sessionRef = doc(db, 'analytics_sessions', visitorId);
    if (isReturning) {
      try {
        await updateDoc(sessionRef, {
          visitCount: increment(1),
          lastActiveAt: serverTimestamp(),
          lastPath: safePath,
          updatedAt: serverTimestamp(),
        });
      } catch {
        await setDoc(sessionRef, {
          visitorId,
          visitCount: 1,
          firstSeenAt: serverTimestamp(),
          lastActiveAt: serverTimestamp(),
          lastPath: safePath,
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      try {
        await setDoc(sessionRef, {
          visitorId,
          visitCount: 1,
          firstSeenAt: serverTimestamp(),
          lastActiveAt: serverTimestamp(),
          lastPath: safePath,
          updatedAt: serverTimestamp(),
        });
      } catch {
        await updateDoc(sessionRef, {
          visitCount: increment(1),
          lastActiveAt: serverTimestamp(),
          lastPath: safePath,
          updatedAt: serverTimestamp(),
        });
      }
      localStorage.setItem(VISITOR_REGISTERED_KEY, '1');
    }
  } catch (err) {
    // Non-blocking analytics fail-safe
    console.warn('Visit telemetry skipped:', err);
  }
}

export async function updateSessionHeartbeat(currentPath: string): Promise<void> {
  const visitorId = getOrCreateVisitorId();
  const safePath = (currentPath || '/').slice(0, 200);
  try {
    await updateDoc(doc(db, 'analytics_sessions', visitorId), {
      lastActiveAt: serverTimestamp(),
      lastPath: safePath,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Ignore if session doc doesn't exist yet
  }
}

export async function startFilmViewSession(
  filmId: string,
  durationSeconds: number
): Promise<string | null> {
  if (!filmId || !/^[a-zA-Z0-9_-]+$/.test(filmId)) return null;
  const visitorId = getOrCreateVisitorId();
  const viewId = randomSafeId('vw');
  const dateKey = getDateKey();

  try {
    await setDoc(doc(db, 'analytics_views', viewId), {
      viewId,
      filmId,
      visitorId,
      dateKey,
      watchedSeconds: 0,
      durationSeconds: Math.min(86400, Math.max(0, Math.round(durationSeconds || 0))),
      completed: false,
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return viewId;
  } catch (err) {
    console.warn('Could not record view start:', err);
    return null;
  }
}

export async function updateFilmViewProgress(
  viewId: string,
  watchedSeconds: number,
  durationSeconds: number,
  completed: boolean,
  alreadyMarkedCompleted: boolean
): Promise<void> {
  if (!viewId) return;
  try {
    const payload: Record<string, unknown> = {
      watchedSeconds: Math.min(86400, Math.max(0, Math.round(watchedSeconds))),
      durationSeconds: Math.min(86400, Math.max(0, Math.round(durationSeconds || 0))),
      completed: Boolean(completed || alreadyMarkedCompleted),
      updatedAt: serverTimestamp(),
    };
    if (completed && !alreadyMarkedCompleted) {
      payload.completedAt = serverTimestamp();
    }
    await updateDoc(doc(db, 'analytics_views', viewId), payload);
  } catch (err) {
    console.warn('Could not update view progress:', err);
  }
}

function toDate(val: unknown): Date {
  if (val instanceof Timestamp) return val.toDate();
  if (val && typeof (val as { toDate?: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate();
  }
  if (val instanceof Date) return val;
  return new Date();
}

export function resolveDateBounds(
  preset: AnalyticsRangePreset,
  customStart?: string,
  customEnd?: string
): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    return { start, end };
  }
  if (preset === '7d') {
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  if (preset === '30d') {
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  if (preset === '90d') {
    const start = new Date(end);
    start.setDate(start.getDate() - 89);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  const parsedStart = customStart ? new Date(`${customStart}T00:00:00`) : new Date(end);
  const parsedEnd = customEnd ? new Date(`${customEnd}T23:59:59.999`) : end;
  if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
    const fallbackStart = new Date(end);
    fallbackStart.setDate(fallbackStart.getDate() - 29);
    fallbackStart.setHours(0, 0, 0, 0);
    return { start: fallbackStart, end };
  }
  return { start: parsedStart, end: parsedEnd };
}

function buildDateKeysBetween(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const limit = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let guard = 0;
  while (cursor <= limit && guard < 366) {
    keys.push(getDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }
  return keys;
}

export async function fetchAdminAnalyticsReport(
  films: Film[],
  preset: AnalyticsRangePreset,
  customStart?: string,
  customEnd?: string
): Promise<AnalyticsDashboardReport> {
  let sessions: AnalyticsSession[] = [];
  let visits: AnalyticsVisit[] = [];
  let views: AnalyticsView[] = [];

  try {
    const [sessionsSnap, visitsSnap, viewsSnap] = await Promise.all([
      getDocs(collection(db, 'analytics_sessions')),
      getDocs(collection(db, 'analytics_visits')),
      getDocs(collection(db, 'analytics_views')),
    ]);

    sessions = sessionsSnap.docs.map((d) => {
      const x = d.data() as Record<string, unknown>;
      return {
        visitorId: String(x.visitorId || d.id),
        visitCount: Number(x.visitCount || 1),
        firstSeenAt: toDate(x.firstSeenAt),
        lastActiveAt: toDate(x.lastActiveAt),
        lastPath: typeof x.lastPath === 'string' ? x.lastPath : '/',
        updatedAt: toDate(x.updatedAt),
      };
    });

    visits = visitsSnap.docs.map((d) => {
      const x = d.data() as Record<string, unknown>;
      return {
        visitId: String(x.visitId || d.id),
        visitorId: String(x.visitorId || ''),
        isReturning: Boolean(x.isReturning),
        dateKey: String(x.dateKey || ''),
        createdAt: toDate(x.createdAt),
      };
    });

    views = viewsSnap.docs.map((d) => {
      const x = d.data() as Record<string, unknown>;
      return {
        viewId: String(x.viewId || d.id),
        filmId: String(x.filmId || ''),
        visitorId: String(x.visitorId || ''),
        dateKey: String(x.dateKey || ''),
        watchedSeconds: Number(x.watchedSeconds || 0),
        durationSeconds: Number(x.durationSeconds || 0),
        completed: Boolean(x.completed),
        startedAt: toDate(x.startedAt),
        completedAt: x.completedAt ? toDate(x.completedAt) : undefined,
        updatedAt: toDate(x.updatedAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'analytics');
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date(todayStart);
  monthStart.setDate(monthStart.getDate() - 29);
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const todayKey = getDateKey(now);

  const { start, end } = resolveDateBounds(preset, customStart, customEnd);
  const rangeKeys = buildDateKeysBetween(start, end);

  const visitsInRange = visits.filter((v) => v.createdAt >= start && v.createdAt <= end);
  const viewsInRange = views.filter((v) => v.startedAt >= start && v.startedAt <= end);

  // Visitor metrics
  const totalVisitors = visitsInRange.length;
  const todayVisitors = new Set(
    visits.filter((v) => v.createdAt >= todayStart).map((v) => v.visitorId)
  ).size;
  const weekVisitors = new Set(
    visits.filter((v) => v.createdAt >= weekStart).map((v) => v.visitorId)
  ).size;
  const monthVisitors = new Set(
    visits.filter((v) => v.createdAt >= monthStart).map((v) => v.visitorId)
  ).size;
  const uniqueVisitors = new Set(visitsInRange.map((v) => v.visitorId)).size;
  const returningVisits = visitsInRange.filter((v) => v.isReturning).length;
  const activeNowEstimated = sessions.filter((s) => s.lastActiveAt >= fiveMinutesAgo).length;

  // View metrics
  const totalViews = viewsInRange.length;
  const todayViews = views.filter((v) => v.dateKey === todayKey).length;
  const weekViews = views.filter((v) => v.startedAt >= weekStart).length;
  const monthViews = views.filter((v) => v.startedAt >= monthStart).length;
  const totalPlayStarts = viewsInRange.length;
  const completedViews = viewsInRange.filter((v) => v.completed).length;
  const totalWatchSeconds = viewsInRange.reduce((acc, v) => acc + v.watchedSeconds, 0);
  const avgWatchSeconds = totalViews > 0 ? Math.round(totalWatchSeconds / totalViews) : 0;
  const overallCompletionRate = totalViews > 0 ? Math.round((completedViews / totalViews) * 100) : 0;

  // Daily series for charts
  const visitorByDay = new Map<string, { visitors: number; returning: number }>();
  for (const k of rangeKeys) visitorByDay.set(k, { visitors: 0, returning: 0 });
  for (const v of visitsInRange) {
    const bucket = visitorByDay.get(v.dateKey);
    if (bucket) {
      bucket.visitors += 1;
      if (v.isReturning) bucket.returning += 1;
    }
  }

  const viewsByDay = new Map<string, { views: number; completed: number }>();
  for (const k of rangeKeys) viewsByDay.set(k, { views: 0, completed: 0 });
  for (const v of viewsInRange) {
    const bucket = viewsByDay.get(v.dateKey);
    if (bucket) {
      bucket.views += 1;
      if (v.completed) bucket.completed += 1;
    }
  }

  // Per-film breakdown
  const filmMap = new Map(films.map((f) => [f.id, f]));
  const viewsByFilm = new Map<string, AnalyticsView[]>();
  for (const v of viewsInRange) {
    const arr = viewsByFilm.get(v.filmId) || [];
    arr.push(v);
    viewsByFilm.set(v.filmId, arr);
  }

  const filmSummaries: FilmAnalyticsSummary[] = films.map((film) => {
    const filmViews = viewsByFilm.get(film.id) || [];
    const uniqueSet = new Set(filmViews.map((x) => x.visitorId));
    const filmToday = views.filter((x) => x.filmId === film.id && x.dateKey === todayKey).length;
    const filmCompleted = filmViews.filter((x) => x.completed).length;
    const sumSec = filmViews.reduce((acc, x) => acc + x.watchedSeconds, 0);
    const avgSec = filmViews.length > 0 ? Math.round(sumSec / filmViews.length) : 0;
    const rate = filmViews.length > 0 ? Math.round((filmCompleted / filmViews.length) * 100) : 0;
    const sortedLatest = [...filmViews].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    const dailyMap = new Map<string, { views: number; completed: number }>();
    for (const k of rangeKeys) dailyMap.set(k, { views: 0, completed: 0 });
    for (const fv of filmViews) {
      const b = dailyMap.get(fv.dateKey);
      if (b) {
        b.views += 1;
        if (fv.completed) b.completed += 1;
      }
    }

    return {
      filmId: film.id,
      titleAr: film.titleAr,
      titleEn: film.titleEn,
      totalViews: filmViews.length,
      uniqueViewers: uniqueSet.size,
      todayViews: filmToday,
      avgWatchSeconds: avgSec,
      completedCount: filmCompleted,
      completionRate: rate,
      lastWatchedAt: sortedLatest[0]?.startedAt,
      dailySeries: rangeKeys.map((dateKey) => ({
        dateKey,
        views: dailyMap.get(dateKey)?.views || 0,
        completed: dailyMap.get(dateKey)?.completed || 0,
      })),
    };
  });

  // Also include any filmId present in views even if removed from current visible list
  for (const [filmId, filmViews] of viewsByFilm.entries()) {
    if (!filmMap.has(filmId)) {
      const uniqueSet = new Set(filmViews.map((x) => x.visitorId));
      const filmCompleted = filmViews.filter((x) => x.completed).length;
      const sumSec = filmViews.reduce((acc, x) => acc + x.watchedSeconds, 0);
      const sortedLatest = [...filmViews].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      filmSummaries.push({
        filmId,
        titleAr: filmId,
        titleEn: filmId,
        totalViews: filmViews.length,
        uniqueViewers: uniqueSet.size,
        todayViews: views.filter((x) => x.filmId === filmId && x.dateKey === todayKey).length,
        avgWatchSeconds: filmViews.length > 0 ? Math.round(sumSec / filmViews.length) : 0,
        completedCount: filmCompleted,
        completionRate: filmViews.length > 0 ? Math.round((filmCompleted / filmViews.length) * 100) : 0,
        lastWatchedAt: sortedLatest[0]?.startedAt,
        dailySeries: [],
      });
    }
  }

  const filmRankings = [...filmSummaries].sort((a, b) => b.totalViews - a.totalViews);
  const topFilm = filmRankings.length > 0 && filmRankings[0].totalViews > 0 ? filmRankings[0] : null;
  const recentlyWatchedFilms = [...filmSummaries]
    .filter((f) => f.lastWatchedAt)
    .sort((a, b) => (b.lastWatchedAt?.getTime() || 0) - (a.lastWatchedAt?.getTime() || 0))
    .slice(0, 5);

  return {
    totalVisitors,
    todayVisitors,
    weekVisitors,
    monthVisitors,
    uniqueVisitors,
    returningVisits,
    activeNowEstimated,
    totalViews,
    todayViews,
    weekViews,
    monthViews,
    totalPlayStarts,
    completedViews,
    avgWatchSeconds,
    overallCompletionRate,
    topFilm,
    recentlyWatchedFilms,
    visitorTrafficSeries: rangeKeys.map((dateKey) => ({
      dateKey,
      visitors: visitorByDay.get(dateKey)?.visitors || 0,
      returning: visitorByDay.get(dateKey)?.returning || 0,
    })),
    filmViewsSeries: rangeKeys.map((dateKey) => ({
      dateKey,
      views: viewsByDay.get(dateKey)?.views || 0,
      completed: viewsByDay.get(dateKey)?.completed || 0,
    })),
    filmRankings,
  };
}

export function exportAnalyticsCsv(report: AnalyticsDashboardReport, rangeLabel: string): void {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines: string[] = [];

  lines.push(['AZ FILMS ANALYTICS REPORT', rangeLabel].map(escape).join(','));
  lines.push('');
  lines.push(['Metric', 'Value'].map(escape).join(','));
  lines.push(['Total Platform Visits (Range)', report.totalVisitors].map(escape).join(','));
  lines.push(['Unique Visitors (Range)', report.uniqueVisitors].map(escape).join(','));
  lines.push(['Returning Visits (Range)', report.returningVisits].map(escape).join(','));
  lines.push(['Visitors Today', report.todayVisitors].map(escape).join(','));
  lines.push(['Visitors This Week', report.weekVisitors].map(escape).join(','));
  lines.push(['Visitors This Month', report.monthVisitors].map(escape).join(','));
  lines.push(['Estimated Active Now', report.activeNowEstimated].map(escape).join(','));
  lines.push(['Total Film Views (Range)', report.totalViews].map(escape).join(','));
  lines.push(['Views Today', report.todayViews].map(escape).join(','));
  lines.push(['Views This Week', report.weekViews].map(escape).join(','));
  lines.push(['Views This Month', report.monthViews].map(escape).join(','));
  lines.push(['Completed Views (Range)', report.completedViews].map(escape).join(','));
  lines.push(['Average Watch Seconds', report.avgWatchSeconds].map(escape).join(','));
  lines.push(['Completion Rate (%)', report.overallCompletionRate].map(escape).join(','));
  lines.push('');
  lines.push(
    ['Film ID', 'Arabic Title', 'English Title', 'Total Views', 'Unique Viewers', 'Today Views', 'Avg Watch Seconds', 'Completed Count', 'Completion Rate (%)']
      .map(escape)
      .join(',')
  );

  for (const row of report.filmRankings) {
    lines.push(
      [
        row.filmId,
        row.titleAr,
        row.titleEn,
        row.totalViews,
        row.uniqueViewers,
        row.todayViews,
        row.avgWatchSeconds,
        row.completedCount,
        row.completionRate,
      ]
        .map(escape)
        .join(',')
    );
  }

  const csvContent = '\uFEFF' + lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `az-films-analytics-${getDateKey()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
