import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import gsap from 'gsap';
import { GAME_WIDTH, COLORS, LAYOUT, FONTS } from '@utils/constants';

const TURN_TIMEOUT = 30; // 30 seconds per turn

export class HUD extends Container {
  // Single unified turn indicator (positioned in opponent area at top)
  private turnIndicatorContainer!: Container;
  private turnIndicatorBg!: Graphics;
  private turnIndicatorText!: Text;

  // Timeout notification
  private notificationContainer!: Container;
  private notificationText!: Text;

  // Timer state
  private turnTimeRemaining: number = TURN_TIMEOUT;
  private isTimerRunning: boolean = false;
  private currentTurn: 'player' | 'opponent' = 'player';

  // Player names for display
  private playerName: string = '나';
  private opponentName: string = '상대';

  constructor() {
    super();

    // Create single unified turn indicator (positioned in opponent area at top)
    this.createTurnIndicator();

    // Create notification overlay
    this.createNotification();

    // Menu button (top-right)
    this.createMenuButton();

    // Initialize visibility
    this.updateTurn('player');
  }

  private createTurnIndicator(): void {
    this.turnIndicatorContainer = new Container();

    // Background pill - wider to accommodate text format "[OOO님 차례입니다. NN초 남았습니다]"
    this.turnIndicatorBg = new Graphics();
    this.turnIndicatorBg.roundRect(-180, -22, 360, 44, 22);
    this.turnIndicatorBg.fill({ color: COLORS.PRIMARY, alpha: 0.85 });
    this.turnIndicatorContainer.addChild(this.turnIndicatorBg);

    // Turn indicator text - format: "[OOO님 차례입니다. NN초 남았습니다]"
    this.turnIndicatorText = new Text({
      text: '나님 차례입니다. 30초 남았습니다',
      style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: 16,
        fontWeight: 'bold',
        fill: COLORS.TEXT,
      }),
    });
    this.turnIndicatorText.anchor.set(0.5);
    this.turnIndicatorContainer.addChild(this.turnIndicatorText);

    // Position in opponent area (top of screen where opponent's flipped cards are shown)
    this.turnIndicatorContainer.position.set(LAYOUT.GAME_AREA_CENTER_X, LAYOUT.OPPONENT_HAND_Y - 50);
    this.addChild(this.turnIndicatorContainer);
  }

  /**
   * Set player names for turn indicator display
   */
  setPlayerNames(playerName: string, opponentName: string): void {
    this.playerName = playerName || '나';
    this.opponentName = opponentName || '상대';
    // Update display with current names
    this.updateTurnIndicatorDisplay();
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

    // Update background color based on whose turn it is
    // COLORS.PRIMARY for player's turn (my turn), COLORS.WARNING for opponent's turn
    this.updateTurnIndicatorBackground();

    // Animate turn indicator on turn change
    if (turnChanged) {
      this.turnIndicatorContainer.alpha = 0;
      gsap.to(this.turnIndicatorContainer, { alpha: 1, duration: 0.3 });
    }

    // Reset timer only when turn actually changes or forced
    if (turnChanged || forceResetTimer) {
      this.resetTurnTimer();
    }

    // Update display text
    this.updateTurnIndicatorDisplay();
  }

  /**
   * Update turn indicator background color based on whose turn it is
   */
  private updateTurnIndicatorBackground(): void {
    // Clear and redraw background with appropriate color
    this.turnIndicatorBg.clear();
    this.turnIndicatorBg.roundRect(-180, -22, 360, 44, 22);
    // Use COLORS.PRIMARY for player's turn (matches player's ID color in collected cards)
    // Use COLORS.WARNING for opponent's turn (matches opponent's ID color in collected cards)
    const bgColor = this.currentTurn === 'player' ? COLORS.PRIMARY : COLORS.WARNING;
    this.turnIndicatorBg.fill({ color: bgColor, alpha: 0.85 });
  }

  /**
   * Update turn indicator text display with player name and remaining time
   */
  private updateTurnIndicatorDisplay(): void {
    const seconds = Math.ceil(this.turnTimeRemaining);
    const name = this.currentTurn === 'player' ? this.playerName : this.opponentName;
    this.turnIndicatorText.text = `${name}님 차례입니다. ${seconds}초 남았습니다`;

    // Change text color based on time remaining for urgency
    if (seconds <= 5) {
      this.turnIndicatorText.style.fill = COLORS.ERROR;
      // Pulse animation when low time
      gsap.to(this.turnIndicatorText.scale, {
        x: 1.1,
        y: 1.1,
        duration: 0.2,
        yoyo: true,
        repeat: 1,
      });
    } else if (seconds <= 10) {
      this.turnIndicatorText.style.fill = COLORS.WARNING;
    } else {
      this.turnIndicatorText.style.fill = COLORS.TEXT;
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
    this.updateTurnIndicatorDisplay();
  }

  stopTimer(): void {
    this.isTimerRunning = false;
  }

  startTimer(): void {
    this.isTimerRunning = true;
  }

  updateTimer(deltaTime: number): void {
    if (!this.isTimerRunning) return;

    this.turnTimeRemaining -= deltaTime / 60; // Convert frames to seconds

    if (this.turnTimeRemaining <= 0) {
      this.turnTimeRemaining = 0;
      this.isTimerRunning = false;
      this.emit('turnTimeout', this.currentTurn);
    }

    this.updateTurnIndicatorDisplay();
  }

  showTimeoutNotification(): void {
    this.notificationText.text = '제한 시간이 경과하여 턴이 넘어갑니다';
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
