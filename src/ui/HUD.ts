import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import gsap from 'gsap';
import { GAME_WIDTH, COLORS, LAYOUT, FONTS } from '@utils/constants';

const TURN_TIMEOUT = 30; // 30 seconds per turn

export class HUD extends Container {
  // Turn indicators for each player
  private playerTurnContainer!: Container;
  private opponentTurnContainer!: Container;
  private playerTimerText!: Text;
  private opponentTimerText!: Text;

  // Timeout notification
  private notificationContainer!: Container;
  private notificationText!: Text;

  // Timer state
  private turnTimeRemaining: number = TURN_TIMEOUT;
  private isTimerRunning: boolean = false;
  private currentTurn: 'player' | 'opponent' = 'player';

  constructor() {
    super();

    // Create turn indicators for both areas
    this.playerTurnContainer = this.createTurnIndicator(true);
    this.opponentTurnContainer = this.createTurnIndicator(false);

    // Extract timer text references
    this.playerTimerText = this.playerTurnContainer.getChildByName('timerText') as Text;
    this.opponentTimerText = this.opponentTurnContainer.getChildByName('timerText') as Text;

    // Position containers
    this.playerTurnContainer.position.set(LAYOUT.GAME_AREA_CENTER_X, LAYOUT.PLAYER_HAND_Y + 30);
    this.opponentTurnContainer.position.set(LAYOUT.GAME_AREA_CENTER_X, LAYOUT.OPPONENT_HAND_Y - 50);

    this.addChild(this.playerTurnContainer);
    this.addChild(this.opponentTurnContainer);

    // Create notification overlay
    this.createNotification();

    // Menu button (top-right)
    this.createMenuButton();

    // Initialize visibility
    this.updateTurn('player');
  }

  private createTurnIndicator(isPlayer: boolean): Container {
    const container = new Container();

    // Background pill
    const bg = new Graphics();
    bg.roundRect(-120, -25, 240, 50, 25);
    const backgroundAlpha = isPlayer ? 0.65 : 0.9;
    bg.fill({ color: isPlayer ? COLORS.PRIMARY : COLORS.WARNING, alpha: backgroundAlpha });
    container.addChild(bg);

    // Turn text
    const turnText = new Text({
      text: isPlayer ? '내 차례' : '상대 차례',
      style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: 20,
        fontWeight: 'bold',
        fill: COLORS.TEXT,
      }),
    });
    turnText.anchor.set(0.5);
    turnText.position.set(-30, 0);
    turnText.name = 'turnText';
    container.addChild(turnText);

    // Timer background (circular)
    const timerBg = new Graphics();
    timerBg.circle(70, 0, 22);
    timerBg.fill({ color: 0x000000, alpha: 0.3 });
    timerBg.name = 'timerBg';
    container.addChild(timerBg);

    // Timer text
    const timerText = new Text({
      text: '30',
      style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: 18,
        fontWeight: 'bold',
        fill: COLORS.TEXT,
      }),
    });
    timerText.anchor.set(0.5);
    timerText.position.set(70, 0);
    timerText.name = 'timerText';
    container.addChild(timerText);

    return container;
  }

  private createNotification(): void {
    this.notificationContainer = new Container();
    this.notificationContainer.visible = false;

    // Semi-transparent background
    const notificationBg = new Graphics();
    notificationBg.roundRect(-250, -30, 500, 60, 10);
    notificationBg.fill({ color: 0x000000, alpha: 0.85 });
    this.notificationContainer.addChild(notificationBg);

    // Notification text
    this.notificationText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: 18,
        fontWeight: 'bold',
        fill: COLORS.WARNING,
      }),
    });
    this.notificationText.anchor.set(0.5);
    this.notificationContainer.addChild(this.notificationText);

    // Position at center of screen
    this.notificationContainer.position.set(LAYOUT.GAME_AREA_CENTER_X, LAYOUT.FIELD_TOP_Y + 50);
    this.addChild(this.notificationContainer);
  }

  private createMenuButton(): void {
    const button = new Graphics();
    button.roundRect(GAME_WIDTH - 60, 10, 50, 40, 8);
    button.fill(COLORS.SECONDARY);

    // Menu icon (3 lines)
    button.rect(GAME_WIDTH - 48, 18, 26, 3);
    button.rect(GAME_WIDTH - 48, 26, 26, 3);
    button.rect(GAME_WIDTH - 48, 34, 26, 3);
    button.fill(COLORS.TEXT);

    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.on('pointerdown', () => {
      this.emit('menuClick');
    });

    this.addChild(button);
  }

  updateScores(_scores: { player: number; opponent: number }): void {
    // Scores are now displayed in CollectedCardsDisplay
  }

  updateTurn(turn: 'player' | 'opponent', forceResetTimer: boolean = false): void {
    const turnChanged = this.currentTurn !== turn;
    this.currentTurn = turn;

    // Show/hide appropriate turn indicators with animation
    if (turn === 'player') {
      this.playerTurnContainer.visible = true;
      this.opponentTurnContainer.visible = false;
      this.playerTurnContainer.alpha = 0;
      gsap.to(this.playerTurnContainer, { alpha: 1, duration: 0.3 });
    } else {
      this.playerTurnContainer.visible = false;
      this.opponentTurnContainer.visible = true;
      this.opponentTurnContainer.alpha = 0;
      gsap.to(this.opponentTurnContainer, { alpha: 1, duration: 0.3 });
    }

    // Reset timer only when turn actually changes or forced
    if (turnChanged || forceResetTimer) {
      this.resetTurnTimer();
    }
  }

  updateCollectedCounts(
    _player: { kwang: number; animal: number; ribbon: number; pi: number },
    _opponent: { kwang: number; animal: number; ribbon: number; pi: number }
  ): void {
    // Counts are now displayed in CollectedCardsDisplay
  }

  resetTurnTimer(): void {
    this.turnTimeRemaining = TURN_TIMEOUT;
    this.isTimerRunning = true;
    this.updateTimerDisplay();
  }

  stopTimer(): void {
    this.isTimerRunning = false;
  }

  startTimer(): void {
    this.isTimerRunning = true;
  }

  private updateTimerDisplay(): void {
    const seconds = Math.ceil(this.turnTimeRemaining);
    const timerText = this.currentTurn === 'player' ? this.playerTimerText : this.opponentTimerText;

    timerText.text = seconds.toString();

    // Change color based on time remaining
    if (seconds <= 5) {
      timerText.style.fill = COLORS.ERROR;
      // Pulse animation when low time
      gsap.to(timerText.scale, {
        x: 1.2,
        y: 1.2,
        duration: 0.2,
        yoyo: true,
        repeat: 1,
      });
    } else if (seconds <= 10) {
      timerText.style.fill = COLORS.WARNING;
    } else {
      timerText.style.fill = COLORS.TEXT;
    }
  }

  updateTimer(deltaTime: number): void {
    if (!this.isTimerRunning) return;

    this.turnTimeRemaining -= deltaTime / 60; // Convert frames to seconds

    if (this.turnTimeRemaining <= 0) {
      this.turnTimeRemaining = 0;
      this.isTimerRunning = false;
      this.emit('turnTimeout', this.currentTurn);
    }

    this.updateTimerDisplay();
  }

  showTimeoutNotification(): void {
    this.notificationText.text = '시간이 경과하여 상대방 차례로 변경되었습니다';
    this.notificationContainer.visible = true;
    this.notificationContainer.alpha = 0;

    gsap.to(this.notificationContainer, {
      alpha: 1,
      duration: 0.3,
      onComplete: () => {
        gsap.to(this.notificationContainer, {
          alpha: 0,
          duration: 0.3,
          delay: 2,
          onComplete: () => {
            this.notificationContainer.visible = false;
          },
        });
      },
    });
  }

  showNotification(message: string): void {
    this.notificationText.text = message;
    this.notificationContainer.visible = true;
    this.notificationContainer.alpha = 0;

    gsap.to(this.notificationContainer, {
      alpha: 1,
      duration: 0.3,
      onComplete: () => {
        gsap.to(this.notificationContainer, {
          alpha: 0,
          duration: 0.3,
          delay: 2,
          onComplete: () => {
            this.notificationContainer.visible = false;
          },
        });
      },
    });
  }

  getTurnTimeRemaining(): number {
    return this.turnTimeRemaining;
  }

  showGoPrompt(): void {
    // TODO: Show Go/Stop selection UI
  }

  hideGoPrompt(): void {
    // TODO: Hide Go/Stop selection UI
  }
}
