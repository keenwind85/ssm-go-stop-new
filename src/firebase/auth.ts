import {
  signInAnonymously,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  type User,
  type UserCredential,
} from 'firebase/auth';
import { ref, set, get, update } from 'firebase/database';
import { getFirebaseAuth, getRealtimeDatabase } from './config';
import { UserData } from '@utils/types';
import { FIREBASE_PATHS } from '@utils/constants';

let currentUser: User | null = null;

export function getCurrentUser(): User | null {
  return currentUser;
}

export function getCurrentUserId(): string | null {
  return currentUser?.uid ?? null;
}

export async function signInAsGuest(): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  const credential = await signInAnonymously(auth);
  await createOrUpdateUserProfile(credential.user);
  return credential;
}

export async function signInWithGoogle(): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(auth, provider);
  await createOrUpdateUserProfile(credential.user);
  return credential;
}

export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  await firebaseSignOut(auth);
  currentUser = null;
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, (user: User | null) => {
    currentUser = user;
    callback(user);
  });
}

async function createOrUpdateUserProfile(user: User): Promise<void> {
  const database = getRealtimeDatabase();
  const userRef = ref(database, `${FIREBASE_PATHS.USERS}/${user.uid}`);

  const snapshot = await get(userRef);

  if (!snapshot.exists()) {
    // Create new user profile
    const userData: UserData = {
      id: user.uid,
      name: user.displayName || `Guest_${user.uid.slice(0, 6)}`,
      wins: 0,
      losses: 0,
      rating: 1000,
      createdAt: Date.now(),
    };

    await set(userRef, userData);
  } else {
    // Update last login
    await update(userRef, {
      lastLoginAt: Date.now(),
    });
  }
}

export async function getUserProfile(userId: string): Promise<UserData | null> {
  const database = getRealtimeDatabase();
  const userRef = ref(database, `${FIREBASE_PATHS.USERS}/${userId}`);

  const snapshot = await get(userRef);
  return snapshot.exists() ? (snapshot.val() as UserData) : null;
}

export async function updateUserStats(
  userId: string,
  isWin: boolean,
  ratingChange: number
): Promise<void> {
  const database = getRealtimeDatabase();
  const userRef = ref(database, `${FIREBASE_PATHS.USERS}/${userId}`);

  const snapshot = await get(userRef);
  if (!snapshot.exists()) return;

  const userData = snapshot.val() as UserData;

  await update(userRef, {
    wins: isWin ? userData.wins + 1 : userData.wins,
    losses: isWin ? userData.losses : userData.losses + 1,
    rating: userData.rating + ratingChange,
  });
}
