import { Application, Graphics, Container, Ticker, Text, TextStyle } from 'pixi.js';
import { Scene } from './Scene';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, POSITIONS, LAYERS, LAYOUT } from '@utils/constants';
import { Deck } from '@game/objects/Deck';
import { Field } from '@game/objects/Field';
import { Hand } from '@game/objects/Hand';
import { Card } from '@game/objects/Card';
import { CollectedCardsDisplay } from '@game/objects/CollectedCardsDisplay';
import { HUD } from '@ui/HUD';
import { TurnManager } from '@game/systems/TurnManager';
import { ScoreCalculator } from '@game/systems/ScoreCalculator';

interface GameSceneData {
  mode: 'ai' | 'multiplayer';
  roomId?: string;
}

export class GameScene extends Scene {
  private gameMode: 'ai' | 'multiplayer' = 'ai';
  private roomId?: string;

  getRoomId(): string | undefined {
    return this.roomId;
  }

  // Game layers
  private backgroundLayer: Container;
  private fieldLayer: Container;
  private handLayer: Container;
  private animationLayer: Container;
  private uiLayer: Container;

  // Game objects
  private deck!: Deck;
  private field!: Field;
  private playerHand!: Hand;
  private opponentHand!: Hand;
  private playerCollectedDisplay!: CollectedCardsDisplay;
  private opponentCollectedDisplay!: CollectedCardsDisplay;
  private hud!: HUD;

  // Game systems
  private turnManager!: TurnManager;
  private scoreCalculator!: ScoreCalculator;

  constructor(app: Application) {
    super(app);

    // Initialize layers
    this.backgroundLayer = new Container();
    this.fieldLayer = new Container();
    this.handLayer = new Container();
    this.animationLayer = new Container();
    this.uiLayer = new Container();

    // Set z-index
    this.backgroundLayer.zIndex = LAYERS.BACKGROUND;
    this.fieldLayer.zIndex = LAYERS.FIELD;
    this.handLayer.zIndex = LAYERS.HAND;
    this.animationLayer.zIndex = LAYERS.ANIMATION;
    this.uiLayer.zIndex = LAYERS.UI;

    this.container.sortableChildren = true;
  }

  async onEnter(data?: GameSceneData): Promise<void> {
    if (data) {
      this.gameMode = data.mode;
      this.roomId = data.roomId;
    }

    // Add layers
    this.container.addChild(this.backgroundLayer);
    this.container.addChild(this.fieldLayer);
    this.container.addChild(this.handLayer);
    this.container.addChild(this.animationLayer);
    this.container.addChild(this.uiLayer);

    // Create background
    this.createBackground();

    // Initialize game objects
    this.initializeGame();

    // Start game ticker
    this.app.ticker.add(this.onTick, this);
  }

  onExit(): void {
    this.app.ticker.remove(this.onTick, this);

    this.backgroundLayer.removeChildren();
    this.fieldLayer.removeChildren();
    this.handLayer.removeChildren();
    this.animationLayer.removeChildren();
    this.uiLayer.removeChildren();

    this.container.removeChildren();
  }

  private createBackground(): void {
    // Main background
    const bg = new Graphics();
    bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    bg.fill(COLORS.BACKGROUND);
    this.backgroundLayer.addChild(bg);

    // Field area (center - dark blue table)
    const fieldArea = new Graphics();
    const fieldAreaWidth = LAYOUT.GAME_AREA_WIDTH;
    const fieldAreaHeight = LAYOUT.FIELD_BOTTOM_Y - LAYOUT.FIELD_TOP_Y;
    const fieldAreaX = 0;
    const fieldAreaY = LAYOUT.FIELD_TOP_Y;

    fieldArea.roundRect(fieldAreaX, fieldAreaY, fieldAreaWidth, fieldAreaHeight, 16);
    fieldArea.fill({ color: 0x0f3460, alpha: 0.9 });
    fieldArea.stroke({ width: 3, color: 0x1a4a7a });
    this.backgroundLayer.addChild(fieldArea);

    // Right panel background (deck + collected cards area)
    const rightPanel = new Graphics();
    rightPanel.roundRect(
      LAYOUT.GAME_AREA_WIDTH + 10,
      20,
      GAME_WIDTH - LAYOUT.GAME_AREA_WIDTH - 30,
      GAME_HEIGHT - 40,
      12
    );
    rightPanel.fill({ color: COLORS.SECONDARY, alpha: 0.5 });
    this.backgroundLayer.addChild(rightPanel);
  }

  private initializeGame(): void {
    // Initialize deck
    this.deck = new Deck();
    this.deck.position.set(POSITIONS.DECK.x, POSITIONS.DECK.y);
    this.fieldLayer.addChild(this.deck);

    // Initialize field (center cards)
    this.field = new Field();
    this.field.position.set(POSITIONS.FIELD.x, POSITIONS.FIELD.y);
    this.fieldLayer.addChild(this.field);

    // Initialize player hand
    this.playerHand = new Hand(true);
    this.playerHand.position.set(POSITIONS.PLAYER_HAND.x, POSITIONS.PLAYER_HAND.y);
    this.handLayer.addChild(this.playerHand);

    // Initialize opponent hand
    this.opponentHand = new Hand(false);
    this.opponentHand.position.set(POSITIONS.OPPONENT_HAND.x, POSITIONS.OPPONENT_HAND.y);
    this.handLayer.addChild(this.opponentHand);

    // Initialize collected cards displays
    this.playerCollectedDisplay = new CollectedCardsDisplay(true);
    this.playerCollectedDisplay.position.set(POSITIONS.PLAYER_COLLECTED.x, POSITIONS.PLAYER_COLLECTED.y);
    this.uiLayer.addChild(this.playerCollectedDisplay);

    this.opponentCollectedDisplay = new CollectedCardsDisplay(false);
    this.opponentCollectedDisplay.position.set(POSITIONS.OPPONENT_COLLECTED.x, POSITIONS.OPPONENT_COLLECTED.y);
    this.uiLayer.addChild(this.opponentCollectedDisplay);

    // Initialize HUD
    this.hud = new HUD();
    this.uiLayer.addChild(this.hud);

    // Initialize game systems
    this.scoreCalculator = new ScoreCalculator();
    this.turnManager = new TurnManager({
      deck: this.deck,
      field: this.field,
      playerHand: this.playerHand,
      opponentHand: this.opponentHand,
      scoreCalculator: this.scoreCalculator,
      isAIMode: this.gameMode === 'ai',
    });

    // Setup event handlers
    this.setupEventHandlers();

    // Deal initial cards
    this.turnManager.dealInitialCards();
  }

  private setupEventHandlers(): void {
    // Player card hover - highlight matching field cards
    this.playerHand.on('cardHover', (month: number) => {
      if (this.turnManager.isPlayerTurn()) {
        this.field.highlightMatchingCards(month);
      }
    });

    this.playerHand.on('cardHoverEnd', () => {
      this.field.clearAllHighlights();
    });

    // Player card selection
    this.playerHand.on('cardSelected', (card) => {
      if (this.turnManager.isPlayerTurn()) {
        this.field.clearAllHighlights();
        this.turnManager.handleCardPlay(card);
      }
    });

    // Field card selection (for matching) - handled below with deck selection

    // Turn events
    this.turnManager.on('turnEnd', () => {
      this.hud.updateTurn(this.turnManager.getCurrentTurn());
      this.field.clearAllHighlights();
    });

    this.turnManager.on('scoreUpdate', (scores) => {
      this.hud.updateScores(scores);
    });

    // Collected counts update
    this.turnManager.on('collectedUpdate', (data: {
      player: { kwang: number; animal: number; ribbon: number; pi: number };
      opponent: { kwang: number; animal: number; ribbon: number; pi: number };
      playerCards: { kwang: Card[]; animal: Card[]; ribbon: Card[]; pi: Card[] };
      opponentCards: { kwang: Card[]; animal: Card[]; ribbon: Card[]; pi: Card[] };
    }) => {
      this.hud.updateCollectedCounts(data.player, data.opponent);
      this.playerCollectedDisplay.updateFromCards(data.playerCards);
      this.opponentCollectedDisplay.updateFromCards(data.opponentCards);
    });

    this.turnManager.on('gameEnd', (result) => {
      this.hud.stopTimer();
      console.log('Game ended:', result);
      this.changeScene('result', result);
    });

    // Turn timeout handling
    this.hud.on('turnTimeout', (turn: 'player' | 'opponent') => {
      if (turn === 'player' && this.turnManager.isPlayerTurn()) {
        this.hud.showTimeoutNotification();
        this.turnManager.forceSkipTurn();
      }
    });

    // Stop timer during card resolution
    this.turnManager.on('resolving', () => {
      this.hud.stopTimer();
    });

    // Resume timer when turn starts
    this.turnManager.on('turnStart', () => {
      this.hud.startTimer();
    });

    // Deck card selection (2-match from deck)
    this.turnManager.on('requireDeckSelection', (data: { card: Card; matchingCards: Card[] }) => {
      this.hud.showNotification('뒷패로 바닥패를 선택하세요');
      data.matchingCards.forEach(card => {
        card.setMatchHighlight(true);
      });
    });

    // Field card selected for deck matching
    this.field.on('cardSelected', (card) => {
      if (this.turnManager.isWaitingForDeckSelection()) {
        this.field.clearAllHighlights();
        this.turnManager.handleDeckCardSelection(card);
      } else if (this.turnManager.isWaitingForFieldSelection()) {
        this.turnManager.handleFieldCardSelection(card);
      }
    });

    // Go/Stop decision
    this.turnManager.on('goStopDecision', (data: { player: 'player' | 'opponent'; score: number; goCount: number }) => {
      if (data.player === 'player') {
        this.showGoStopPrompt(data.score, data.goCount);
      } else {
        this.hud.showNotification('상대가 고/스톱을 결정 중...');
      }
    });

    this.turnManager.on('goDeclared', (data: { player: 'player' | 'opponent'; goCount: number }) => {
      const who = data.player === 'player' ? '내가' : '상대가';
      this.hud.showNotification(`${who} 고! (${data.goCount}회)`);
    });

    this.turnManager.on('stopDeclared', (player: 'player' | 'opponent') => {
      const who = player === 'player' ? '내가' : '상대가';
      this.hud.showNotification(`${who} 스톱!`);
    });

    // Special events
    this.turnManager.on('shake', (data: { player: 'player' | 'opponent'; month: number }) => {
      const who = data.player === 'player' ? '나' : '상대';
      this.hud.showNotification(`${who} 흔들기! (${data.month}월)`);
    });

    this.turnManager.on('bomb', (data: { player: 'player' | 'opponent'; month: number }) => {
      const who = data.player === 'player' ? '나' : '상대';
      this.hud.showNotification(`${who} 폭탄! (${data.month}월)`);
    });

    this.turnManager.on('ppuk', (player: 'player' | 'opponent') => {
      const who = player === 'player' ? '나' : '상대';
      this.hud.showNotification(`${who} 뻑!`);
    });
  }

  private onTick(ticker: Ticker): void {
    this.turnManager.update(ticker.deltaTime);
    this.hud.updateTimer(ticker.deltaTime);
  }

  private goStopContainer: Container | null = null;

  private showGoStopPrompt(score: number, goCount: number): void {
    // Remove existing prompt if any
    if (this.goStopContainer) {
      this.uiLayer.removeChild(this.goStopContainer);
      this.goStopContainer.destroy();
    }

    this.goStopContainer = new Container();
    this.goStopContainer.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Background overlay
    const overlay = new Graphics();
    overlay.rect(-GAME_WIDTH / 2, -GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT);
    overlay.fill({ color: 0x000000, alpha: 0.6 });
    this.goStopContainer.addChild(overlay);

    // Prompt box
    const box = new Graphics();
    box.roundRect(-200, -120, 400, 240, 16);
    box.fill({ color: COLORS.SECONDARY, alpha: 0.95 });
    box.stroke({ width: 3, color: COLORS.PRIMARY });
    this.goStopContainer.addChild(box);

    // Title
    const title = new Text({
      text: '고/스톱',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 32,
        fontWeight: 'bold',
        fill: COLORS.TEXT,
      }),
    });
    title.anchor.set(0.5);
    title.position.set(0, -80);
    this.goStopContainer.addChild(title);

    // Score info
    const scoreText = new Text({
      text: `현재 점수: ${score}점 ${goCount > 0 ? `(${goCount}고)` : ''}`,
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 20,
        fill: COLORS.TEXT,
      }),
    });
    scoreText.anchor.set(0.5);
    scoreText.position.set(0, -30);
    this.goStopContainer.addChild(scoreText);

    // Go button
    const goButton = new Graphics();
    goButton.roundRect(-170, 20, 150, 60, 10);
    goButton.fill({ color: COLORS.WARNING });
    goButton.eventMode = 'static';
    goButton.cursor = 'pointer';
    goButton.on('pointerdown', () => {
      this.hideGoStopPrompt();
      this.turnManager.declareGo();
    });
    this.goStopContainer.addChild(goButton);

    const goText = new Text({
      text: '고',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 24,
        fontWeight: 'bold',
        fill: COLORS.TEXT,
      }),
    });
    goText.anchor.set(0.5);
    goText.position.set(-95, 50);
    this.goStopContainer.addChild(goText);

    // Stop button
    const stopButton = new Graphics();
    stopButton.roundRect(20, 20, 150, 60, 10);
    stopButton.fill({ color: COLORS.PRIMARY });
    stopButton.eventMode = 'static';
    stopButton.cursor = 'pointer';
    stopButton.on('pointerdown', () => {
      this.hideGoStopPrompt();
      this.turnManager.declareStop();
    });
    this.goStopContainer.addChild(stopButton);

    const stopText = new Text({
      text: '스톱',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 24,
        fontWeight: 'bold',
        fill: COLORS.TEXT,
      }),
    });
    stopText.anchor.set(0.5);
    stopText.position.set(95, 50);
    this.goStopContainer.addChild(stopText);

    this.uiLayer.addChild(this.goStopContainer);
  }

  private hideGoStopPrompt(): void {
    if (this.goStopContainer) {
      this.uiLayer.removeChild(this.goStopContainer);
      this.goStopContainer.destroy();
      this.goStopContainer = null;
    }
  }
}
