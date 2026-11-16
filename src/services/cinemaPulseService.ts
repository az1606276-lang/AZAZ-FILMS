import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getOrCreateVisitorId } from './analyticsService';

export type PulseKind = 'fire' | 'shock' | 'heart';

export interface FilmPulsePoint {
  timeSec: number;
  durationSec: number;
  kind: PulseKind;
}

const VIEWER_NAME_KEY = 'az_viewer_credit_name_v1';
const VIEWER_SEATS_KEY = 'az_viewer_seats_v1';

export function getSavedViewerCreditName(fallback?: string): string {
  try {
    const saved = localStorage.getItem(VIEWER_NAME_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch {
    // Ignore storage error
  }
  return fallback?.trim() || '';
}

export function saveViewerCreditName(name: string): void {
  try {
    localStorage.setItem(VIEWER_NAME_KEY, name.trim().slice(0, 60));
  } catch {
    // Ignore storage error
  }
}

export function getViewerSeatNumber(filmId: string): string {
  try {
    const raw = localStorage.getItem(VIEWER_SEATS_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    if (map[filmId]) return map[filmId];
    const visitorId = getOrCreateVisitorId();
    let hash = 0;
    const seed = `${filmId}:${visitorId}`;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) % 9000;
    }
    const seat = `#${String(hash + 100).padStart(4, '0')}`;
    map[filmId] = seat;
    localStorage.setItem(VIEWER_SEATS_KEY, JSON.stringify(map));
    return seat;
  } catch {
    return '#0042';
  }
}

export async function sendPresenceHeartbeat(filmId: string, isActive: boolean): Promise<void> {
  if (!filmId || !/^[a-zA-Z0-9_-]+$/.test(filmId)) return;
  const visitorId = getOrCreateVisitorId();
  const presenceId = `${filmId}__${visitorId}`.slice(0, 128);
  const ref = doc(db, 'film_presence', presenceId);

  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        isActive,
        updatedAt: serverTimestamp(),
      });
    } else if (isActive) {
      await setDoc(ref, {
        presenceId,
        filmId,
        visitorId,
        isActive: true,
        updatedAt: serverTimestamp(),
      });
    }
  } catch {
    // Silently ignore transient presence errors
  }
}

export function subscribeFilmPresenceCount(
  filmId: string,
  onUpdate: (activeCount: number) => void
): Unsubscribe {
  if (!filmId || !/^[a-zA-Z0-9_-]+$/.test(filmId)) {
    onUpdate(1);
    return () => {};
  }

  const q = query(collection(db, 'film_presence'), where('filmId', '==', filmId));
  return onSnapshot(
    q,
    (snap) => {
      const cutoffMs = Date.now() - 55000;
      let count = 0;
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        if (data.isActive !== true) continue;
        const ts = data.updatedAt;
        if (ts instanceof Timestamp) {
          if (ts.toMillis() >= cutoffMs) count += 1;
        } else {
          count += 1;
        }
      }
      onUpdate(Math.max(1, count));
    },
    () => {
      onUpdate(1);
    }
  );
}

export async function sendFilmPulse(
  filmId: string,
  kind: PulseKind,
  timeSec: number,
  durationSec: number
): Promise<void> {
  if (!filmId || !/^[a-zA-Z0-9_-]+$/.test(filmId)) return;
  const visitorId = getOrCreateVisitorId();
  const pulseId = `${filmId}_${visitorId}_${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const safeTime = Math.min(86400, Math.max(0, Math.round(timeSec)));
  const safeDur = Math.min(86400, Math.max(0, Math.round(durationSec)));

  try {
    await setDoc(doc(db, 'film_pulses', pulseId), {
      pulseId,
      filmId,
      visitorId,
      kind,
      timeSec: safeTime,
      durationSec: safeDur,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Ignore transient network errors
  }
}

export function subscribeFilmPulses(
  filmId: string,
  onUpdate: (pulses: FilmPulsePoint[]) => void
): Unsubscribe {
  if (!filmId || !/^[a-zA-Z0-9_-]+$/.test(filmId)) {
    onUpdate([]);
    return () => {};
  }

  const q = query(collection(db, 'film_pulses'), where('filmId', '==', filmId));
  return onSnapshot(
    q,
    (snap) => {
      const items: FilmPulsePoint[] = [];
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        const kind = data.kind;
        if (kind !== 'fire' && kind !== 'shock' && kind !== 'heart') continue;
        items.push({
          timeSec: Number(data.timeSec || 0),
          durationSec: Number(data.durationSec || 0),
          kind,
        });
      }
      onUpdate(items);
    },
    () => {
      onUpdate([]);
    }
  );
}
