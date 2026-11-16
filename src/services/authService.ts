import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import type { UserProfile, UserRole } from '../types/cinema';

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutAccount(): Promise<void> {
  await signOut(auth);
}

export async function syncUserProfile(user: User): Promise<UserProfile> {
  const userRef = doc(db, 'users', user.uid);
  const isBootstrapped =
    Boolean(user.emailVerified) &&
    user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  const effectiveAdmin = isBootstrapped;

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const role: UserRole = effectiveAdmin ? 'admin' : 'viewer';
      const newProfile = {
        uid: user.uid,
        email: (user.email || '').slice(0, 320),
        displayName: (user.displayName || user.email?.split('@')[0] || 'AZ Member').slice(0, 120),
        photoURL: (user.photoURL || '').slice(0, 1000),
        role,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(userRef, newProfile);
      return {
        ...newProfile,
        role,
      };
    }

    const existing = snap.data() as Record<string, unknown>;
    const existingRole = existing.role === 'admin' ? 'admin' : 'viewer';
    const resolvedRole: UserRole = effectiveAdmin ? 'admin' : 'viewer';

    const nextDisplayName = (user.displayName || String(existing.displayName || 'AZ Member')).slice(0, 120);
    const nextPhoto = (user.photoURL || String(existing.photoURL || '')).slice(0, 1000);

    if (
      nextDisplayName !== existing.displayName ||
      nextPhoto !== (existing.photoURL || '') ||
      (isBootstrapped && existingRole !== 'admin')
    ) {
      await updateDoc(userRef, {
        displayName: nextDisplayName,
        photoURL: nextPhoto,
        ...(isBootstrapped && existingRole !== 'admin' ? { role: 'admin' } : {}),
        updatedAt: serverTimestamp(),
      });
    }

    return {
      uid: user.uid,
      email: String(existing.email || user.email || ''),
      displayName: nextDisplayName,
      photoURL: nextPhoto,
      role: resolvedRole,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }
}

export function subscribeWatchlist(
  uid: string,
  onUpdate: (filmIds: string[]) => void
): Unsubscribe {
  const path = `users/${uid}/watchlist`;
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const ids = snap.docs.map((d) => d.id);
      onUpdate(ids);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function addToWatchlist(uid: string, filmId: string): Promise<void> {
  const path = `users/${uid}/watchlist/${filmId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'watchlist', filmId), {
      filmId,
      userId: uid,
      addedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function removeFromWatchlist(uid: string, filmId: string): Promise<void> {
  const path = `users/${uid}/watchlist/${filmId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'watchlist', filmId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchAllUsers(): Promise<UserProfile[]> {
  try {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        uid: d.id,
        email: String(data.email || ''),
        displayName: String(data.displayName || ''),
        photoURL: typeof data.photoURL === 'string' ? data.photoURL : '',
        role: data.role === 'admin' ? 'admin' : 'viewer',
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
  }
}

export async function updateUserRole(
  targetUser: UserProfile,
  newRole: UserRole,
  grantedByUid: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', targetUser.uid), {
      role: newRole,
      updatedAt: serverTimestamp(),
    });

    if (newRole === 'admin') {
      await setDoc(doc(db, 'admins', targetUser.uid), {
        uid: targetUser.uid,
        email: targetUser.email,
        grantedBy: grantedByUid,
        createdAt: serverTimestamp(),
      });
    } else if (targetUser.email.toLowerCase() !== BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
      await deleteDoc(doc(db, 'admins', targetUser.uid));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${targetUser.uid}`);
  }
}
