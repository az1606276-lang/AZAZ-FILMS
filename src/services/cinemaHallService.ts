import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { getOrCreateVisitorId } from './analyticsService';

export type SeatTier = 'front' | 'sweet_spot' | 'vip';

export interface SeatBooking {
  bookingId: string;
  filmId: string;
  seatCode: string;
  tier: SeatTier;
  visitorId: string;
  viewerName: string;
  createdAt: Date;
}

export interface SeatPerspective {
  seatCode: string;
  rowLetter: string;
  rowIndex: number; // 0 (A) .. 4 (E)
  colNumber: number; // 1..10
  tier: SeatTier;
  pan: number; // -0.65 .. +0.65
  depth: number; // 0.15 .. 0.72
  rotateYDeg: number; // gentle horizontal screen angle
  rotateXDeg: number; // subtle upward tilt for front rows
  screenScale: number; // visual scale inside the 3D auditorium
}

export const AUDITORIUM_ROWS = ['A', 'B', 'C', 'D', 'E'] as const;
export const AUDITORIUM_COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const LOCAL_SEAT_PREFIX = 'az_booked_seat_';

export function getSeatTier(seatCode: string): SeatTier {
  const row = seatCode.charAt(0).toUpperCase();
  if (row === 'E') return 'vip';
  if (row === 'C' || row === 'D') return 'sweet_spot';
  return 'front';
}

export function getSeatPerspective(seatCode: string): SeatPerspective {
  const normalized = seatCode.trim().toUpperCase();
  const rowLetter = normalized.charAt(0) || 'C';
  const rowIndexRaw = AUDITORIUM_ROWS.indexOf(rowLetter as (typeof AUDITORIUM_ROWS)[number]);
  const rowIndex = rowIndexRaw >= 0 ? rowIndexRaw : 2;
  const colRaw = Number(normalized.slice(1));
  const colNumber = Number.isFinite(colRaw) && colRaw >= 1 && colRaw <= 10 ? colRaw : 5;

  const colOffset = (colNumber - 5.5) / 4.5; // -1 (far left) .. +1 (far right)
  const pan = Number((-colOffset * 0.55).toFixed(2));
  const depth = Number((0.15 + (rowIndex / 4) * 0.52).toFixed(2));
  const rotateYDeg = Number((-colOffset * 5.2).toFixed(2));
  const rotateXDeg = rowIndex === 0 ? 4.5 : rowIndex === 1 ? 2.2 : rowIndex === 4 ? -1.5 : 0;
  const screenScale = [1.02, 0.96, 0.9, 0.84, 0.78][rowIndex] ?? 0.88;

  return {
    seatCode: `${AUDITORIUM_ROWS[rowIndex]}${colNumber}`,
    rowLetter: AUDITORIUM_ROWS[rowIndex],
    rowIndex,
    colNumber,
    tier: getSeatTier(`${AUDITORIUM_ROWS[rowIndex]}${colNumber}`),
    pan,
    depth,
    rotateYDeg,
    rotateXDeg,
    screenScale,
  };
}

export function getSavedBookedSeat(filmId: string): string | null {
  if (!filmId) return null;
  try {
    return localStorage.getItem(`${LOCAL_SEAT_PREFIX}${filmId}`);
  } catch {
    return null;
  }
}

export function saveLocalBookedSeat(filmId: string, seatCode: string): void {
  if (!filmId || !seatCode) return;
  try {
    localStorage.setItem(`${LOCAL_SEAT_PREFIX}${filmId}`, seatCode.toUpperCase());
  } catch {
    // Ignore storage errors
  }
}

export function subscribeFilmSeatBookings(
  filmId: string,
  callback: (bookings: SeatBooking[]) => void
): Unsubscribe {
  const colRef = collection(db, 'seat_bookings');
  const q = query(colRef, where('filmId', '==', filmId));

  return onSnapshot(
    q,
    (snap) => {
      const items: SeatBooking[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          bookingId: String(data.bookingId || d.id),
          filmId: String(data.filmId || filmId),
          seatCode: String(data.seatCode || ''),
          tier: (data.tier as SeatTier) || 'sweet_spot',
          visitorId: String(data.visitorId || ''),
          viewerName: String(data.viewerName || ''),
          createdAt:
            data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
        };
      });
      callback(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, `seat_bookings/${filmId}`);
    }
  );
}

export async function bookAuditoriumSeat(
  filmId: string,
  seatCode: string,
  viewerName: string
): Promise<SeatBooking> {
  const cleanFilmId = filmId.trim();
  const cleanSeat = seatCode.trim().toUpperCase();
  const cleanName = viewerName.trim().slice(0, 60) || 'Cinema Guest';
  const visitorId = getOrCreateVisitorId();
  const bookingId = `${cleanFilmId}__${cleanSeat}`;
  const tier = getSeatTier(cleanSeat);

  try {
    await setDoc(doc(db, 'seat_bookings', bookingId), {
      bookingId,
      filmId: cleanFilmId,
      seatCode: cleanSeat,
      tier,
      visitorId,
      viewerName: cleanName,
      createdAt: serverTimestamp(),
    });
    saveLocalBookedSeat(cleanFilmId, cleanSeat);
    return {
      bookingId,
      filmId: cleanFilmId,
      seatCode: cleanSeat,
      tier,
      visitorId,
      viewerName: cleanName,
      createdAt: new Date(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `seat_bookings/${bookingId}`);
    throw error;
  }
}

export async function releaseAuditoriumSeatAdmin(bookingId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'seat_bookings', bookingId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `seat_bookings/${bookingId}`);
  }
}
