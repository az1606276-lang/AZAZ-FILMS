import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getOrCreateVisitorId } from './analyticsService';

const LIKED_LOCAL_KEY = 'az_liked_films_v1';

function getLocalLikes(): Set<string> {
  try {
    const raw = localStorage.getItem(LIKED_LOCAL_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function saveLocalLike(filmId: string): void {
  try {
    const set = getLocalLikes();
    set.add(filmId);
    localStorage.setItem(LIKED_LOCAL_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // Ignore storage restriction
  }
}

export async function fetchFilmReactionSummary(
  filmId: string
): Promise<{ count: number; hasLiked: boolean }> {
  const localHasLiked = getLocalLikes().has(filmId);
  if (!filmId || !/^[a-zA-Z0-9_-]+$/.test(filmId)) {
    return { count: localHasLiked ? 1 : 0, hasLiked: localHasLiked };
  }

  const visitorId = getOrCreateVisitorId();
  const reactionId = `${filmId}__${visitorId}`.slice(0, 120);

  try {
    const snap = await getDocs(
      query(collection(db, 'film_reactions'), where('filmId', '==', filmId))
    );
    const remoteLiked = snap.docs.some((d) => d.id === reactionId);
    if (remoteLiked) saveLocalLike(filmId);
    const hasLiked = localHasLiked || remoteLiked;
    const count = snap.size === 0 && hasLiked ? 1 : snap.size;
    return { count, hasLiked };
  } catch {
    return { count: localHasLiked ? 1 : 0, hasLiked: localHasLiked };
  }
}

export async function submitFilmLike(filmId: string): Promise<boolean> {
  if (!filmId || !/^[a-zA-Z0-9_-]+$/.test(filmId)) return false;
  if (getLocalLikes().has(filmId)) return false;

  saveLocalLike(filmId);
  const visitorId = getOrCreateVisitorId();
  const reactionId = `${filmId}__${visitorId}`.slice(0, 120);

  try {
    await setDoc(doc(db, 'film_reactions', reactionId), {
      reactionId,
      filmId,
      visitorId,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Like sync deferred:', err);
  }
  return true;
}
