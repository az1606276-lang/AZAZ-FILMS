import {
  collection,
  deleteDoc,
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
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { getOrCreateVisitorId } from './analyticsService';

export interface WatchPartyRoom {
  partyId: string;
  filmId: string;
  hostVisitorId: string;
  hostName: string;
  isPlaying: boolean;
  playbackTime: number;
  isActive: boolean;
  updatedAt: Date;
}

export interface WatchPartyChatMessage {
  messageId: string;
  partyId: string;
  visitorId: string;
  authorName: string;
  text: string;
  filmTimeSec: number;
  createdAt: Date;
}

export interface SceneTimecodeNote {
  noteId: string;
  filmId: string;
  visitorId: string;
  authorName: string;
  text: string;
  timeSec: number;
  isDirectorNote: boolean;
  createdAt: Date;
}

export interface PassportFilmStamp {
  filmId: string;
  titleAr: string;
  titleEn: string;
  year: number;
  genre: string;
  stampedAt: string;
}

export interface CinemaPassportData {
  stamps: PassportFilmStamp[];
  framesCaptured: number;
  partiesJoined: number;
}

const PASSPORT_STORAGE_KEY = 'az_cinema_passport_v1';

function toDate(val: unknown): Date {
  if (val instanceof Timestamp) return val.toDate();
  if (val && typeof (val as { toDate?: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate();
  }
  return new Date();
}

export function generatePartyCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'AZ';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createWatchPartyRoom(
  filmId: string,
  hostName: string,
  initialTimeSec = 0
): Promise<WatchPartyRoom> {
  if (!filmId || !/^[a-zA-Z0-9_-]+$/.test(filmId)) {
    throw new Error('Invalid film ID');
  }
  const partyId = generatePartyCode();
  const visitorId = getOrCreateVisitorId();
  const cleanHost = (hostName || 'AZ Guest').trim().slice(0, 60) || 'AZ Guest';
  const safeTime = Math.min(86400, Math.max(0, Math.round(initialTimeSec * 10) / 10));

  try {
    await setDoc(doc(db, 'watch_parties', partyId), {
      partyId,
      filmId,
      hostVisitorId: visitorId,
      hostName: cleanHost,
      isPlaying: false,
      playbackTime: safeTime,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    recordWatchPartyJoined();
    return {
      partyId,
      filmId,
      hostVisitorId: visitorId,
      hostName: cleanHost,
      isPlaying: false,
      playbackTime: safeTime,
      isActive: true,
      updatedAt: new Date(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `watch_parties/${partyId}`);
  }
}

export async function fetchWatchPartyRoom(rawCode: string): Promise<WatchPartyRoom | null> {
  const partyId = rawCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
  if (partyId.length < 4) return null;
  try {
    const snap = await getDoc(doc(db, 'watch_parties', partyId));
    if (!snap.exists()) return null;
    const x = snap.data() as Record<string, unknown>;
    return {
      partyId: String(x.partyId || partyId),
      filmId: String(x.filmId || ''),
      hostVisitorId: String(x.hostVisitorId || ''),
      hostName: String(x.hostName || 'Host'),
      isPlaying: Boolean(x.isPlaying),
      playbackTime: Number(x.playbackTime || 0),
      isActive: x.isActive !== false,
      updatedAt: toDate(x.updatedAt),
    };
  } catch {
    return null;
  }
}

export function subscribeWatchPartyRoom(
  partyId: string,
  onUpdate: (room: WatchPartyRoom | null) => void
): Unsubscribe {
  if (!partyId || partyId.length < 4 || !/^[a-zA-Z0-9_-]+$/.test(partyId)) {
    onUpdate(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, 'watch_parties', partyId),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      const x = snap.data() as Record<string, unknown>;
      onUpdate({
        partyId: String(x.partyId || partyId),
        filmId: String(x.filmId || ''),
        hostVisitorId: String(x.hostVisitorId || ''),
        hostName: String(x.hostName || 'Host'),
        isPlaying: Boolean(x.isPlaying),
        playbackTime: Number(x.playbackTime || 0),
        isActive: x.isActive !== false,
        updatedAt: toDate(x.updatedAt),
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, `watch_parties/${partyId}`);
    }
  );
}

export async function updateWatchPartyPlayback(
  partyId: string,
  isPlaying: boolean,
  playbackTime: number,
  isActive = true
): Promise<void> {
  if (!partyId || partyId.length < 4) return;
  const safeTime = Math.min(86400, Math.max(0, Math.round(playbackTime * 10) / 10));
  try {
    await updateDoc(doc(db, 'watch_parties', partyId), {
      isPlaying,
      playbackTime: safeTime,
      isActive,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Ignore transient sync conflict
  }
}

export async function sendWatchPartyMessage(
  partyId: string,
  authorName: string,
  text: string,
  filmTimeSec: number
): Promise<void> {
  const cleanText = text.trim().slice(0, 300);
  const cleanName = (authorName || 'Guest').trim().slice(0, 60) || 'Guest';
  if (!cleanText || !partyId || partyId.length < 4) return;

  const visitorId = getOrCreateVisitorId();
  const rand = Math.random().toString(36).slice(2, 7);
  const messageId = `wpm_${Date.now()}_${rand}`.slice(0, 120);
  const safeTime = Math.min(86400, Math.max(0, Math.round(filmTimeSec)));

  try {
    await setDoc(doc(db, 'watch_parties', partyId, 'messages', messageId), {
      messageId,
      partyId,
      visitorId,
      authorName: cleanName,
      text: cleanText,
      filmTimeSec: safeTime,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `watch_parties/${partyId}/messages/${messageId}`);
  }
}

export function subscribeWatchPartyMessages(
  partyId: string,
  onUpdate: (messages: WatchPartyChatMessage[]) => void
): Unsubscribe {
  if (!partyId || partyId.length < 4 || !/^[a-zA-Z0-9_-]+$/.test(partyId)) {
    onUpdate([]);
    return () => {};
  }
  const q = query(
    collection(db, 'watch_parties', partyId, 'messages'),
    where('partyId', '==', partyId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: WatchPartyChatMessage[] = snap.docs.map((d) => {
        const x = d.data() as Record<string, unknown>;
        return {
          messageId: String(x.messageId || d.id),
          partyId: String(x.partyId || partyId),
          visitorId: String(x.visitorId || ''),
          authorName: String(x.authorName || 'Guest'),
          text: String(x.text || ''),
          filmTimeSec: Number(x.filmTimeSec || 0),
          createdAt: toDate(x.createdAt),
        };
      });
      items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      onUpdate(items.slice(-40));
    },
    () => {
      onUpdate([]);
    }
  );
}

// Timecode-Synced Scene Notes
export function subscribeSceneNotes(
  filmId: string,
  onUpdate: (notes: SceneTimecodeNote[]) => void
): Unsubscribe {
  if (!filmId || !/^[a-zA-Z0-9_-]+$/.test(filmId)) {
    onUpdate([]);
    return () => {};
  }
  const q = query(collection(db, 'scene_notes'), where('filmId', '==', filmId));
  return onSnapshot(
    q,
    (snap) => {
      const items: SceneTimecodeNote[] = snap.docs.map((d) => {
        const x = d.data() as Record<string, unknown>;
        return {
          noteId: String(x.noteId || d.id),
          filmId: String(x.filmId || filmId),
          visitorId: String(x.visitorId || ''),
          authorName: String(x.authorName || ''),
          text: String(x.text || ''),
          timeSec: Number(x.timeSec || 0),
          isDirectorNote: Boolean(x.isDirectorNote),
          createdAt: toDate(x.createdAt),
        };
      });
      items.sort((a, b) => a.timeSec - b.timeSec);
      onUpdate(items);
    },
    () => {
      onUpdate([]);
    }
  );
}

export async function addSceneNote(
  filmId: string,
  authorName: string,
  text: string,
  timeSec: number,
  isDirectorNote: boolean
): Promise<void> {
  if (!filmId || !/^[a-zA-Z0-9_-]+$/.test(filmId)) throw new Error('Invalid film ID');
  const cleanAuthor = (authorName || 'Viewer').trim().slice(0, 60);
  const cleanText = text.trim().slice(0, 280);
  if (!cleanAuthor || !cleanText) throw new Error('Missing fields');

  const visitorId = getOrCreateVisitorId();
  const rand = Math.random().toString(36).slice(2, 7);
  const noteId = `sn_${Date.now()}_${rand}`.slice(0, 120);
  const safeTime = Math.min(86400, Math.max(0, Math.round(timeSec)));

  try {
    await setDoc(doc(db, 'scene_notes', noteId), {
      noteId,
      filmId,
      visitorId,
      authorName: cleanAuthor,
      text: cleanText,
      timeSec: safeTime,
      isDirectorNote,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `scene_notes/${noteId}`);
  }
}

export async function deleteSceneNote(noteId: string): Promise<void> {
  if (!noteId) return;
  try {
    await deleteDoc(doc(db, 'scene_notes', noteId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `scene_notes/${noteId}`);
  }
}

// Cinema Passport Local Archive Helpers
export function getCinemaPassportData(): CinemaPassportData {
  try {
    const raw = localStorage.getItem(PASSPORT_STORAGE_KEY);
    if (!raw) return { stamps: [], framesCaptured: 0, partiesJoined: 0 };
    const parsed = JSON.parse(raw) as Partial<CinemaPassportData>;
    return {
      stamps: Array.isArray(parsed.stamps) ? parsed.stamps : [],
      framesCaptured: Number(parsed.framesCaptured || 0),
      partiesJoined: Number(parsed.partiesJoined || 0),
    };
  } catch {
    return { stamps: [], framesCaptured: 0, partiesJoined: 0 };
  }
}

function savePassportData(data: CinemaPassportData): void {
  try {
    localStorage.setItem(PASSPORT_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota errors
  }
}

export function stampCompletedFilm(stamp: Omit<PassportFilmStamp, 'stampedAt'>): void {
  const current = getCinemaPassportData();
  if (current.stamps.some((s) => s.filmId === stamp.filmId)) return;
  current.stamps.unshift({
    ...stamp,
    stampedAt: new Date().toISOString().slice(0, 10),
  });
  savePassportData(current);
}

export function recordCapturedFrameCount(): void {
  const current = getCinemaPassportData();
  current.framesCaptured += 1;
  savePassportData(current);
}

export function recordWatchPartyJoined(): void {
  const current = getCinemaPassportData();
  current.partiesJoined += 1;
  savePassportData(current);
}
