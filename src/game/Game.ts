import { Application, Assets } from 'pixi.js';
import gsap from 'gsap';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '@utils/constants';
import { SceneManager } from './scenes/SceneManager';
import { LoadingScene } from './scenes/LoadingScene';
import { LobbyScene } from './scenes/LobbyScene';
import { GameScene } from './scenes/GameScene';
import { ResultScene } from './scenes/ResultScene';

export class Game {
  private app: Application;
  private container: HTMLElement;
  private sceneManager: SceneManager;
  private isRunning: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.app = new Application();
    this.sceneManager = new SceneManager(this.app);
  }

  async init(): Promise<void> {
    // Initialize PixiJS application
    await this.app.init({
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: COLORS.BACKGROUND,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true,
      powerPreference: 'high-performance',
    });

    // Add canvas to container
    this.container.appendChild(this.app.canvas);

    // Initial resize
    this.resize();

    // Register scenes
    this.sceneManager.register('loading', new LoadingScene(this.app));
    this.sceneManager.register('lobby', new LobbyScene(this.app));
    this.sceneManager.register('game', new GameScene(this.app));
    this.sceneManager.register('result', new ResultScene(this.app));

    // Load initial assets
    await this.loadAssets();
  }

  private async loadAssets(): Promise<void> {
    // Load individual card images
    const cardAssets: Record<string, string> = {};

    // Generate card asset paths (months 1-12, indices 1-4)
    for (let month = 1; month <= 12; month++) {
      for (let index = 1; index <= 4; index++) {
        const paddedMonth = month.toString().padStart(2, '0');
        const key = `card_${paddedMonth}_${index}`;
        cardAssets[key] = `/assets/cards/${paddedMonth}월_${index}.png`;
      }
    }

    // Add bonus cards (보너스_1.png ~ 보너스_6.png)
    for (let i = 1; i <= 6; i++) {
      cardAssets[`card_bonus_${i}`] = `/assets/cards/보너스_${i}.png`;
    }

    // Card back (화투_뒷면.png)
    cardAssets['card_back'] = '/assets/cards/화투_뒷면.png';

    Assets.addBundle('cards', cardAssets);

    Assets.addBundle('ui', {
      // UI assets will be added here
    });

    Assets.addBundle('backgrounds', {
      'field_bg': '/assets/etc/badak.png'
    });

    Assets.addBundle('sounds', {
      // Sound assets will be added here
    });

    // Load card assets
    try {
      await Assets.loadBundle('cards');
      console.log('Card assets loaded successfully');
    } catch (error) {
      console.warn('Some card assets not found:', error);
    }

    // Load background assets
    try {
      await Assets.loadBundle('backgrounds');
      console.log('Background assets loaded successfully');
    } catch (error) {
      console.warn('Background assets not found:', error);
    }
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.sceneManager.changeScene('lobby');
  }

  pause(): void {
    if (!this.isRunning) return;

    // Check if we're in a multiplayer game
    const currentSceneName = this.sceneManager.getCurrentSceneName();
    const isInGame = currentSceneName === 'game';

    if (isInGame) {
      const gameScene = this.sceneManager.getCurrentScene() as GameScene;
      const roomId = gameScene?.getRoomId?.();

      // For multiplayer games, complete all animations immediately instead of pausing
      // This prevents animation state desync when screen is hidden/shown
      if (roomId) {
        // Complete all active GSAP animations immediately
        // This ensures card positions reach their final state before screen is hidden
        const children = gsap.globalTimeline.getChildren(true, true, true);
        children.forEach((tween) => {
          if (tween.progress && typeof tween.progress === 'function') {
            tween.progress(1);
          }
        });
        // Don't stop ticker in multiplayer - Firebase listeners need to continue
        this.isRunning = false;
        return;
      }
    }

    // For single player (AI) mode, pause normally
    gsap.globalTimeline.pause();
    this.app.ticker.stop();
    this.isRunning = false;
  }

  resume(): void {
    if (this.isRunning) return;

    this.app.ticker.start();
    // Resume GSAP animations (for single player mode)
    gsap.globalTimeline.resume();
    this.isRunning = true;
  }

  resize(): void {
    const { innerWidth, innerHeight } = window;
    const scale = Math.min(innerWidth / GAME_WIDTH, innerHeight / GAME_HEIGHT);

    const width = Math.round(GAME_WIDTH * scale);
    const height = Math.round(GAME_HEIGHT * scale);

    this.app.renderer.resize(width, height);
    this.app.stage.scale.set(scale);

    // Center the canvas
    this.app.canvas.style.width = `${width}px`;
    this.app.canvas.style.height = `${height}px`;
  }

  getApp(): Application {
    return this.app;
  }

  getSceneManager(): SceneManager {
    return this.sceneManager;
  }
}
