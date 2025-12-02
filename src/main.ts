import { Game } from '@game/Game';
import { initializeFirebase } from '@fb/config';
import { initializeAuthOverlay } from '@ui/AuthOverlay';

// Try to lock screen orientation to landscape
async function lockLandscapeOrientation(): Promise<void> {
  try {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
    if (orientation && typeof orientation.lock === 'function') {
      await orientation.lock('landscape');
    }
  } catch {
    // Orientation lock not supported or denied - fallback to CSS overlay
    console.log('Screen orientation lock not supported, using CSS fallback');
  }
}

async function init(): Promise<void> {
  const container = document.getElementById('game-container');
  const loadingElement = document.getElementById('loading');
  const progressElement = document.getElementById('loading-progress');

  if (!container) {
    throw new Error('Game container not found');
  }

  const updateProgress = (message: string): void => {
    if (progressElement) {
      progressElement.textContent = message;
    }
  };

  try {
    initializeFirebase();
    initializeAuthOverlay();

    updateProgress('게임 초기화 중...');

    const game = new Game(container);

    updateProgress('에셋 로딩 중...');
    await game.init();

    updateProgress('준비 완료!');

    // Hide loading screen
    setTimeout(() => {
      loadingElement?.classList.add('hidden');
    }, 500);

    // Start the game
    game.start();

    // Try to lock to landscape orientation on mobile
    lockLandscapeOrientation();

    // Handle visibility change for pause/resume
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        game.pause();
      } else {
        game.resume();
      }
    });

    // Handle resize
    window.addEventListener('resize', () => {
      game.resize();
    });

    // Expose game instance for debugging (development only)
    if (import.meta.env.DEV) {
      (window as unknown as { game: Game }).game = game;
    }

  } catch (error) {
    console.error('Failed to initialize game:', error);
    updateProgress('오류가 발생했습니다. 새로고침해주세요.');
  }
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
