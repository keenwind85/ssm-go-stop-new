import type { User } from 'firebase/auth';
import { initializeFirebase } from '@fb/config';
import { onAuthChange, signInWithGoogle } from '@fb/auth';

let initialized = false;
let overlayElement: HTMLElement | null = null;
let statusElement: HTMLElement | null = null;
let googleButton: HTMLButtonElement | null = null;
let currentUser: User | null = null;
let isProcessing = false;
const waiters: Array<(user: User) => void> = [];

function setOverlayVisible(visible: boolean): void {
  overlayElement?.classList.toggle('hidden', !visible);
}

function setStatus(message: string, isError = false): void {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle('error', isError);
}

function setButtonDisabled(disabled: boolean): void {
  if (googleButton) {
    googleButton.disabled = disabled;
  }
}

export function initializeAuthOverlay(): void {
  if (initialized) return;
  initialized = true;

  initializeFirebase();

  overlayElement = document.getElementById('auth-overlay');
  statusElement = document.getElementById('auth-status');
  googleButton = document.getElementById('google-login') as HTMLButtonElement | null;

  googleButton?.addEventListener('click', async () => {
    if (isProcessing) return;
    isProcessing = true;
    setButtonDisabled(true);
    setStatus('Google 로그인 중...');
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Google login failed', error);
      setStatus('로그인에 실패했습니다. 잠시 후 다시 시도해주세요.', true);
    } finally {
      isProcessing = false;
      setButtonDisabled(false);
    }
  });

  onAuthChange((user) => {
    currentUser = user;
    if (user) {
      setStatus(`${user.displayName ?? '플레이어'}님 환영합니다!`);
      setTimeout(() => setOverlayVisible(false), 300);
      if (waiters.length > 0) {
        const resolvers = waiters.splice(0, waiters.length);
        resolvers.forEach(resolve => resolve(user));
      }
    }
  });
}

export function requireGoogleSignIn(reason?: string): Promise<User> {
  initializeAuthOverlay();

  if (currentUser) {
    return Promise.resolve(currentUser);
  }

  if (reason) {
    setStatus(reason);
  } else {
    setStatus('멀티 플레이를 이용하려면 Google 로그인이 필요합니다.');
  }

  setOverlayVisible(true);

  return new Promise<User>((resolve) => {
    waiters.push(resolve);
  });
}

export function getAuthenticatedUser(): User | null {
  return currentUser;
}
