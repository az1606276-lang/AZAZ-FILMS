import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { FilmComment } from '../types/cinema';
import { getOrCreateVisitorId } from './analyticsService';

function toDate(val: unknown): Date {
  if (val instanceof Timestamp) return val.toDate();
  if (val && typeof (val as { toDate?: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate();
  }
  return new Date();
}

export async function fetchFilmComments(filmId: string): Promise<FilmComment[]> {
  if (!filmId || !/^[a-zA-Z0-9_-]+$/.test(filmId)) return [];
  try {
    const snap = await getDocs(
      query(collection(db, 'film_comments'), where('filmId', '==', filmId))
    );
    const items: FilmComment[] = snap.docs.map((d) => {
      const x = d.data() as Record<string, unknown>;
      return {
        commentId: String(x.commentId || d.id),
        filmId: String(x.filmId || filmId),
        visitorId: String(x.visitorId || ''),
        authorName: String(x.authorName || ''),
        text: String(x.text || ''),
        createdAt: toDate(x.createdAt),
      };
    });
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return items;
  } catch (err) {
    console.warn('Could not load film comments:', err);
    return [];
  }
}

export async function submitFilmComment(
  filmId: string,
  authorName: string,
  text: string
): Promise<FilmComment> {
  const cleanName = authorName.trim().slice(0, 60);
  const cleanText = text.trim().slice(0, 600);
  if (!filmId || !/^[a-zA-Z0-9_-]+$/.test(filmId)) {
    throw new Error('Invalid film ID.');
  }
  if (!cleanName || !cleanText) {
    throw new Error('Name and comment are required.');
  }

  const visitorId = getOrCreateVisitorId();
  const rand = Math.random().toString(36).slice(2, 8);
  const commentId = `cmt_${Date.now()}_${rand}`.slice(0, 120);

  try {
    await setDoc(doc(db, 'film_comments', commentId), {
      commentId,
      filmId,
      visitorId,
      authorName: cleanName,
      text: cleanText,
      createdAt: serverTimestamp(),
    });

    return {
      commentId,
      filmId,
      visitorId,
      authorName: cleanName,
      text: cleanText,
      createdAt: new Date(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `film_comments/${commentId}`);
  }
}

export async function deleteFilmComment(commentId: string): Promise<void> {
  if (!commentId) return;
  try {
    await deleteDoc(doc(db, 'film_comments', commentId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `film_comments/${commentId}`);
  }
}
