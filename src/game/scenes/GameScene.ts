import { Application, Graphics, Container, Ticker, Text, TextStyle } from 'pixi.js';
import { Scene } from './Scene';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, POSITIONS, LAYERS, LAYOUT, FIREBASE_PATHS, FONTS } from '@utils/constants';
import { Deck } from '@game/objects/Deck';
import { Field } from '@game/objects/Field';
import { Hand } from '@game/objects/Hand';
import { Card } from '@game/objects/Card';
import { CollectedCardsDisplay } from '@game/objects/CollectedCardsDisplay';
import { HUD } from '@ui/HUD';
import { TurnManager } from '@game/systems/TurnManager';
import { ScoreCalculator } from '@game/systems/ScoreCalculator';
import { getCurrentUserId, getUserProfile } from '@fb/auth';
import { getRealtimeDatabase } from '@fb/config';
import { ref, get, onValue, update } from 'firebase/database';
import { GameSync } from '@fb/gameSync';
import type { GameState, RoomData, CardData, PlayerState, RoomJoinRequest, ScoreBreakdown } from '@utils/types';
import { Button } from '@ui/Button';

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
  private turnManager: TurnManager | null = null;
  private scoreCalculator!: ScoreCalculator;
  private gameSync: GameSync | null = null;
  private multiplayerRole: 'host' | 'guest' | null = null;
  private multiplayerPlayers: {
    host: { id: string; name: string };
    guest?: { id: string; name: string };
  } | null = null;
  private hostSyncInterval: number | null = null;
  private roomWatcherUnsubscribe: (() => void) | null = null;
  private waitingOverlay: Container | null = null;
  private waitingOverlayText: Text | null = null;
  private joinRequestPrompt: Container | null = null;
  private activeJoinRequestId: string | null = null;
  private hasInitializedMultiplayerSystems = false;
  private lastReceivedGameState: GameState | null = null;
  private lastKnownTurn: 'player' | 'opponent' | null = null;  // 게스트의 이전 턴 상태 추적
  // 애니메이션 진행 중 상태 동기화 방지용
  private isAnimatingCard = false;
  private pendingStateUpdate: GameState | null = null;

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
    await this.initializeGame();

    // Start game ticker
    this.app.ticker.add(this.onTick, this);
  }

  onExit(): void {
    this.app.ticker.remove(this.onTick, this);

    this.roomWatcherUnsubscribe?.();
    this.roomWatcherUnsubscribe = null;
    this.destroyWaitingOverlay();
    this.destroyJoinRequestPrompt();
    this.multiplayerRole = null;
    this.activeJoinRequestId = null;
    this.hasInitializedMultiplayerSystems = false;

    if (this.hostSyncInterval) {
      window.clearInterval(this.hostSyncInterval);
      this.hostSyncInterval = null;
    }

    this.gameSync?.cleanup();
    this.gameSync = null;

    this.turnManager = null;

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

  private async initializeGame(): Promise<void> {
    this.setupBaseObjects();

    if (this.gameMode === 'multiplayer') {
      await this.initializeMultiplayerFlow();
    } else {
      await this.initializeLocalGameSystems(this.gameMode === 'ai');
    }
  }

  private setupBaseObjects(): void {
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
  }

  private async initializeLocalGameSystems(isAIMode: boolean): Promise<void> {
    this.scoreCalculator = new ScoreCalculator();
    // 멀티플레이어에서는 도전자(상대방)가 선공
    // AI 모드에서는 플레이어가 선공
    const firstTurn: 'player' | 'opponent' = isAIMode ? 'player' : 'opponent';
    this.turnManager = new TurnManager({
      deck: this.deck,
      field: this.field,
      playerHand: this.playerHand,
      opponentHand: this.opponentHand,
      scoreCalculator: this.scoreCalculator,
      isAIMode,
      firstTurn,
      animationLayer: this.animationLayer,
    });

    this.setupEventHandlers();
    await this.turnManager.dealInitialCards();

    // Set initial turn indicators
    this.playerCollectedDisplay.setTurnActive(firstTurn === 'player');
    this.opponentCollectedDisplay.setTurnActive(firstTurn === 'opponent');
  }

  private async initializeMultiplayerFlow(): Promise<void> {
    if (!this.roomId) {
      // roomId가 없으면 로비로 돌아감
      console.error('No roomId for multiplayer flow');
      this.changeScene('lobby');
      return;
    }

    const db = getRealtimeDatabase();
    const roomRef = ref(db, `${FIREBASE_PATHS.ROOMS}/${this.roomId}`);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) {
      // 방이 존재하지 않으면 로비로 돌아감
      console.error('Room does not exist');
      this.changeScene('lobby');
      return;
    }

    const room = snapshot.val() as RoomData;
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
      // 로그인하지 않은 경우 로비로 돌아감
      console.error('User not authenticated');
      this.changeScene('lobby');
      return;
    }

    const role: 'host' | 'guest' = room.host === currentUserId ? 'host' : 'guest';
    this.multiplayerRole = role;
    console.log(`[${role}] Initializing multiplayer flow, roomId:`, this.roomId, 'roomStatus:', room.status);
    this.gameSync = new GameSync(this.roomId);

    const hostProfile = await getUserProfile(room.host);
    const guestProfile = room.guest ? await getUserProfile(room.guest) : null;
    this.multiplayerPlayers = {
      host: {
        id: room.host,
        name: hostProfile?.name ?? room.hostName ?? 'Host',
      },
      guest: room.guest
        ? {
            id: room.guest,
            name: guestProfile?.name ?? room.guestName ?? 'Guest',
          }
        : undefined,
    };

    if (role === 'host') {
      if (room.status === 'playing' && room.guest) {
        const guestName = this.multiplayerPlayers.guest?.name ?? room.guestName ?? 'Guest';
        await this.startHostMultiplayerMatch(room.guest, guestName);
      } else {
        this.hasInitializedMultiplayerSystems = false;
        this.showWaitingOverlay('도전자를 기다리는 중 입니다...');
      }
    } else {
      this.setupGuestView();
    }

    this.attachRoomListener();
  }

  private setupEventHandlers(): void {
    const turnManager = this.turnManager;
    if (!turnManager) return;

    // Player card hover - highlight matching field cards
    this.playerHand.on('cardHover', (month: number) => {
      if (turnManager.isPlayerTurn()) {
        this.field.highlightMatchingCards(month);
      }
    });

    this.playerHand.on('cardHoverEnd', () => {
      this.field.clearAllHighlights();
    });

    // Player card selection
    this.playerHand.on('cardSelected', (card) => {
      console.log('[GameScene] cardSelected received, isPlayerTurn:', turnManager.isPlayerTurn(), 'phase:', turnManager.getPhase());
      if (turnManager.isPlayerTurn()) {
        this.field.clearAllHighlights();
        turnManager.handleCardPlay(card);
      } else {
        console.log('[GameScene] Not player turn, ignoring card selection');
      }
    });

    // Field card selection (for matching) - handled below with deck selection

    // Turn events
    turnManager.on('turnEnd', () => {
      const currentTurn = turnManager.getCurrentTurn();
      this.hud.updateTurn(currentTurn);
      this.field.clearAllHighlights();

      // Update turn indicators with animation
      this.playerCollectedDisplay.setTurnActive(currentTurn === 'player');
      this.opponentCollectedDisplay.setTurnActive(currentTurn === 'opponent');
    });

    turnManager.on('scoreUpdate', (scores) => {
      this.hud.updateScores(scores);
    });

    // Collected counts update
    turnManager.on('collectedUpdate', (data: {
      player: { kwang: number; animal: number; ribbon: number; pi: number };
      opponent: { kwang: number; animal: number; ribbon: number; pi: number };
      playerCards: { kwang: Card[]; animal: Card[]; ribbon: Card[]; pi: Card[] };
      opponentCards: { kwang: Card[]; animal: Card[]; ribbon: Card[]; pi: Card[] };
    }) => {
      this.hud.updateCollectedCounts(data.player, data.opponent);
      this.playerCollectedDisplay.updateFromCards(data.playerCards);
      this.opponentCollectedDisplay.updateFromCards(data.opponentCards);
    });

    turnManager.on('gameEnd', async (result) => {
      this.hud.stopTimer();
      console.log('Game ended:', result);

      // 멀티플레이어 게임 종료 시 Firebase 상태 업데이트
      if (this.gameMode === 'multiplayer' && this.gameSync && this.multiplayerPlayers) {
        try {
          // 승자 ID 결정 (host가 항상 player)
          let winnerId: string;
          let loserId: string;
          if (result.winner === 'player') {
            winnerId = this.multiplayerPlayers.host.id;
            loserId = this.multiplayerPlayers.guest?.id ?? 'unknown';
          } else if (result.winner === 'opponent') {
            winnerId = this.multiplayerPlayers.guest?.id ?? 'unknown';
            loserId = this.multiplayerPlayers.host.id;
          } else {
            winnerId = 'draw'; // 무승부
            loserId = 'draw';
          }

          // result.playerScore와 opponentScore는 숫자임 (ScoreBreakdown은 playerScoreBreakdown)
          const playerFinalScore = result.playerScoreBreakdown?.total ?? result.playerScore ?? 0;
          const opponentFinalScore = result.opponentScoreBreakdown?.total ?? result.opponentScore ?? 0;

          // 승자 점수 계산 (코인 정산용)
          const winnerScore = result.winner === 'player' ? playerFinalScore : opponentFinalScore;

          await this.gameSync.endGame(winnerId, {
            player: playerFinalScore,
            opponent: opponentFinalScore,
          }, winnerScore);

          // Get current room data for round number
          const db = getRealtimeDatabase();
          const roomRef = ref(db, `${FIREBASE_PATHS.ROOMS}/${this.roomId}`);
          const roomSnapshot = await get(roomRef);
          const room = roomSnapshot.exists() ? roomSnapshot.val() as RoomData : null;

          // Pass multiplayer-specific data to result scene
          const multiplayerResult = {
            ...result,
            isMultiplayer: true,
            roomId: this.roomId,
            isHost: this.multiplayerRole === 'host',
            winnerId,
            loserId,
            winnerName: result.winner === 'player'
              ? this.multiplayerPlayers.host.name
              : this.multiplayerPlayers.guest?.name ?? '상대',
            loserName: result.winner === 'player'
              ? this.multiplayerPlayers.guest?.name ?? '상대'
              : this.multiplayerPlayers.host.name,
            roundNumber: room?.roundNumber ?? 1,
          };

          this.changeScene('result', multiplayerResult);
          return;
        } catch (error) {
          console.error('Failed to update game end status:', error);
        }
      }

      this.changeScene('result', result);
    });

    // Turn timeout handling
    this.hud.on('turnTimeout', async (turn: 'player' | 'opponent') => {
      console.log('[GameScene] turnTimeout event received, turn:', turn, 'gameMode:', this.gameMode);

      if (turn === 'player') {
        // 내 턴에서 타임아웃
        if (this.gameMode === 'ai') {
          // AI 모드: 로컬에서 직접 처리
          if (turnManager.isPlayerTurn()) {
            this.hud.showTimeoutNotification();
            turnManager.forceSkipTurn();
          }
        } else {
          // 멀티플레이 모드
          if (this.multiplayerRole === 'host') {
            // 호스트의 턴이 타임아웃: 직접 forceSkipTurn 호출
            if (turnManager.isPlayerTurn()) {
              console.log('[GameScene] Host timeout - forcing skip turn');
              this.hud.showTimeoutNotification();
              turnManager.forceSkipTurn();
            }
          } else {
            // 게스트의 턴이 타임아웃: Firebase로 호스트에게 알림
            console.log('[GameScene] Guest timeout - sending TIMEOUT_SKIP action to host');
            this.hud.showTimeoutNotification();
            if (this.gameSync) {
              await this.gameSync.sendTimeoutSkip();
            }
          }
        }
      }
      // 상대 턴 타임아웃은 상대가 자신의 타임아웃을 처리하므로 여기서 처리하지 않음
    });

    // Stop timer during card resolution
    turnManager.on('resolving', () => {
      this.hud.stopTimer();
    });

    // Resume timer when turn starts (호스트에서 turnStart 이벤트 발생 시)
    turnManager.on('turnStart', (player: 'player' | 'opponent') => {
      // 로컬 플레이어 관점에서 턴 표시 업데이트 및 타이머 리셋
      // 호스트: player=호스트, opponent=게스트
      // 게스트는 applyRemoteState에서 처리하므로 호스트에서만 이 이벤트 수신
      this.hud.updateTurn(player, true);  // forceResetTimer=true로 타이머 리셋
      this.hud.startTimer();
    });

    // Hand card selection (2-match from hand) - 호스트 플레이어 자신
    turnManager.on('requireFieldSelection', (matchingCards: Card[]) => {
      this.hud.showNotification('손패로 바닥패를 선택하세요');
      matchingCards.forEach(card => {
        card.setMatchHighlight(true);
      });
    });

    // Hand card selection (2-match from hand) - 게스트 플레이어 (호스트 화면에서)
    turnManager.on('requireOpponentFieldSelection', (matchingCards: Card[]) => {
      this.hud.showNotification('상대가 바닥패를 선택 중...');
      matchingCards.forEach(card => {
        card.setMatchHighlight(true);
      });
    });

    // Deck card selection (2-match from deck)
    turnManager.on('requireDeckSelection', (data: { card: Card; matchingCards: Card[] }) => {
      this.hud.showNotification('뒷패로 바닥패를 선택하세요');
      data.matchingCards.forEach(card => {
        card.setMatchHighlight(true);
      });
    });

    // Field card selected for hand/deck matching (호스트 측)
    this.field.on('cardSelected', async (card) => {
      if (turnManager.isWaitingForDeckSelection()) {
        this.field.clearAllHighlights();
        await turnManager.handleDeckCardSelection(card);
      } else if (turnManager.isWaitingForFieldSelection()) {
        this.field.clearAllHighlights();
        turnManager.handleFieldCardSelection(card);
      }
    });

    // Go/Stop decision
    turnManager.on('goStopDecision', (data: { player: 'player' | 'opponent'; score: number; goCount: number }) => {
      if (data.player === 'player') {
        this.showGoStopPrompt(data.score, data.goCount);
      } else {
        this.hud.showNotification('상대가 고/스톱을 결정 중...');
      }
    });

    turnManager.on('goDeclared', (data: { player: 'player' | 'opponent'; goCount: number }) => {
      const who = data.player === 'player' ? '내가' : '상대가';
      this.hud.showNotification(`${who} 고! (${data.goCount}회)`);
    });

    turnManager.on('stopDeclared', (player: 'player' | 'opponent') => {
      const who = player === 'player' ? '내가' : '상대가';
      this.hud.showNotification(`${who} 스톱!`);
    });

    // Special events
    turnManager.on('shake', (data: { player: 'player' | 'opponent'; month: number }) => {
      const who = data.player === 'player' ? '나' : '상대';
      this.hud.showNotification(`${who} 흔들기! (${data.month}월)`);
    });

    turnManager.on('bomb', (data: { player: 'player' | 'opponent'; month: number }) => {
      const who = data.player === 'player' ? '나' : '상대';
      this.hud.showNotification(`${who} 폭탄! (${data.month}월)`);
    });

    turnManager.on('ppuk', (player: 'player' | 'opponent') => {
      const who = player === 'player' ? '나' : '상대';
      this.hud.showNotification(`${who} 뻑!`);
    });
  }

  private onTick(ticker: Ticker): void {
    if (this.turnManager) {
      this.turnManager.update(ticker.deltaTime);
    }
    this.hud.updateTimer(ticker.deltaTime);
  }

  private goStopContainer: Container | null = null;

  private showGoStopPrompt(score: number, goCount: number): void {
    // Remove existing prompt if any
    if (this.goStopContainer) {
      this.uiLayer.removeChild(this.goStopContainer);
      this.goStopContainer.destroy();
    }

    const turnManager = this.turnManager;
    if (!turnManager) {
      return;
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
        fontFamily: FONTS.PRIMARY,
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
        fontFamily: FONTS.PRIMARY,
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
      turnManager.declareGo();
    });
    this.goStopContainer.addChild(goButton);

    const goText = new Text({
      text: '고',
      style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
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
      turnManager.declareStop();
    });
    this.goStopContainer.addChild(stopButton);

    const stopText = new Text({
      text: '스톱',
      style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
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

  private startHostSyncLoop(): void {
    this.broadcastGameState();
    if (this.hostSyncInterval) {
      window.clearInterval(this.hostSyncInterval);
    }
    this.hostSyncInterval = window.setInterval(() => {
      this.broadcastGameState();
    }, 1000);
  }

  private async broadcastGameState(): Promise<void> {
    if (!this.turnManager || !this.gameSync || !this.multiplayerPlayers) return;

    const snapshot = this.buildGameStateSnapshot();
    console.log('[Host] Broadcasting game state:', snapshot.phase, snapshot.currentTurn,
      'playerHand:', snapshot.player.hand.length, 'opponentHand:', snapshot.opponent.hand.length,
      'deckCount:', snapshot.deck.length, 'selectionContext:', !!snapshot.selectionContext);
    try {
      await this.gameSync.updateGameState(snapshot);
      console.log('[Host] Game state broadcast successful');
    } catch (error) {
      console.error('[Host] Failed to sync game state', error);
    }
  }

  private buildGameStateSnapshot(): GameState {
    const playerCollected = this.turnManager?.getCollectedCards('player') ?? [];
    const opponentCollected = this.turnManager?.getCollectedCards('opponent') ?? [];

    const playerCollectedGrouped = this.groupCardDataByType(playerCollected);
    const opponentCollectedGrouped = this.groupCardDataByType(opponentCollected);

    const playerScore = this.turnManager?.getScoreBreakdown('player');
    const opponentScore = this.turnManager?.getScoreBreakdown('opponent');

    const playerState: PlayerState = {
      id: this.multiplayerPlayers!.host.id,
      name: this.multiplayerPlayers!.host.name,
      hand: this.playerHand.getCardData(),
      collected: playerCollectedGrouped,
      score: playerScore?.total ?? 0,
      goCount: this.turnManager?.getGoCount('player') ?? 0,
    };

    const opponentInfo = this.multiplayerPlayers?.guest;
    const opponentState: PlayerState = {
      id: opponentInfo?.id ?? 'opponent',
      name: opponentInfo?.name ?? '상대',
      hand: this.opponentHand.getCardData(),
      collected: opponentCollectedGrouped,
      score: opponentScore?.total ?? 0,
      goCount: this.turnManager?.getGoCount('opponent') ?? 0,
    };

    // selectionContext 생성 (2장 매칭 시 선택 필요한 경우)
    const selectionCtx = this.turnManager?.getSelectionContext();
    let selectionContextData: GameState['selectionContext'] = undefined;

    if (selectionCtx) {
      selectionContextData = {
        type: selectionCtx.type,
        options: selectionCtx.options.map(card => card.cardData),
        playedCard: selectionCtx.playedCard.cardData,
        requiredFor: selectionCtx.requiredFor,
      };
    }

    // Firebase rejects undefined but accepts null for deletion
    // Use null to clear selectionContext when not needed
    return {
      phase: this.turnManager?.getPhase() ?? 'waiting',
      currentTurn: this.turnManager?.getCurrentTurn() ?? 'player',
      turnNumber: this.turnManager?.getTurnNumber() ?? 0,
      field: this.field.getCardData(),
      deck: this.deck.getRemainingCardData(),
      player: playerState,
      opponent: opponentState,
      selectionContext: selectionContextData ?? null,
    };
  }

  private groupCardDataByType(cards: Card[]): { kwang: CardData[]; animal: CardData[]; ribbon: CardData[]; pi: CardData[] } {
    const groups = {
      kwang: [] as CardData[],
      animal: [] as CardData[],
      ribbon: [] as CardData[],
      pi: [] as CardData[],
    };

    cards.forEach(card => {
      groups[card.getType()].push(card.cardData);
    });

    return groups;
  }

  private setupGuestView(): void {
    if (!this.gameSync) {
      console.error('[Guest] gameSync is null in setupGuestView, cannot proceed');
      return;
    }

    console.log('[Guest] Setting up guest view, gameSync exists for room:', this.roomId);

    // 게스트용 이벤트 핸들러 먼저 설정 (호스트에게 액션 전달)
    // 상태 변경보다 먼저 설정해야 카드가 생성될 때 이벤트가 제대로 연결됨
    this.setupGuestEventHandlers();

    // Show waiting overlay until host starts the game
    this.showWaitingOverlay('호스트가 게임을 시작하기를 기다리는 중...');

    this.gameSync.onGameStateChange((state) => {
      console.log('[Guest] Received game state change:', state?.phase, state?.currentTurn);
      // Hide waiting overlay once we receive game state
      if (state && state.phase !== 'waiting') {
        console.log('[Guest] Hiding waiting overlay, destroying it completely');
        this.destroyWaitingOverlay();
      }

      // 애니메이션 진행 중이면 상태 업데이트 보류
      if (this.isAnimatingCard) {
        console.log('[Guest] Animation in progress, deferring state update');
        this.pendingStateUpdate = state;
        return;
      }

      this.applyRemoteState(state);
    });
  }

  // 게스트가 카드를 선택하면 호스트에게 전달
  private setupGuestEventHandlers(): void {
    if (!this.gameSync) return;

    console.log('[Guest] Setting up guest event handlers for playerHand');

    // 플레이어(게스트) 카드 선택 - 호스트에게 전달 + 복제 카드로 애니메이션 실행
    // 중요: 실제 카드 상태는 변경하지 않음! applyRemoteState에서만 상태 변경
    this.playerHand.on('cardSelected', async (card: Card) => {
      console.log('[Guest] playerHand cardSelected event received:', card.cardData.id);
      if (!this.gameSync) {
        console.warn('[Guest] gameSync is null, cannot send action');
        return;
      }

      // 턴 체크 - 내 턴이 아니면 알림 표시 (게스트만 체크)
      const myTurn = this.isMyTurn();
      console.log('[Guest] Turn check result:', myTurn);

      if (!myTurn) {
        console.warn('[Guest] Not my turn, showing notification');
        if (this.hud) {
          this.hud.showNotification('상대방의 차례입니다.');
        }
        return;
      }

      // 애니메이션 락 설정
      this.isAnimatingCard = true;

      // 복제 카드 생성 (실제 카드는 건드리지 않음!)
      const cardGlobalPos = card.getGlobalPosition();
      const animClone = card.createAnimationClone();
      animClone.showFront();

      // 실제 카드를 즉시 숨김 (applyRemoteState가 나중에 처리)
      card.visible = false;

      // 매칭 카드 확인
      const matchingCards = this.field.getMatchingCards(card.getMonth());

      // Firebase에 전송 (애니메이션과 병렬로)
      const sendPromise = this.gameSync.playCard(card.cardData.id, {
        targetMonth: card.getMonth(),
      });

      // 복제 카드로 애니메이션 실행 후 자동 제거
      if (matchingCards.length === 0 || matchingCards.length === 3) {
        // 매칭 없거나 뻑 - 바닥으로 이동
        const fieldPos = this.field.getGlobalPosition();
        this.animationLayer.addChild(animClone);
        const localPos = this.animationLayer.toLocal(cardGlobalPos);
        animClone.position.set(localPos.x, localPos.y);
        await animClone.animateAndDestroy(fieldPos.x, fieldPos.y);
      } else {
        // 매칭 - 첫 번째 카드와 애니메이션
        await animClone.matchAnimationAndDestroy(matchingCards[0], this.animationLayer, cardGlobalPos);
      }

      // 애니메이션 완료 후 락 해제 및 보류된 상태 적용
      this.isAnimatingCard = false;
      if (this.pendingStateUpdate) {
        console.log('[Guest] Applying deferred state update after animation');
        const pendingState = this.pendingStateUpdate;
        this.pendingStateUpdate = null;
        this.applyRemoteState(pendingState);
      }

      // Firebase 전송 결과 확인
      sendPromise.then(() => {
        console.log('[Guest] PLAY_CARD action sent successfully');
      }).catch((error) => {
        console.error('[Guest] Failed to send PLAY_CARD action:', error);
        if (this.hud) {
          this.hud.showNotification('카드를 낼 수 없습니다.');
        }
        // 전송 실패 시 카드 다시 표시
        card.visible = true;
      });
    });

    // 플레이어 카드 호버 - 필드 매칭 카드 하이라이트
    this.playerHand.on('cardHover', (month: number) => {
      this.field.highlightMatchingCards(month);
    });

    this.playerHand.on('cardHoverEnd', () => {
      this.field.clearAllHighlights();
    });

    // 필드 카드 선택 (2장 매칭 시) - 호스트에게 전달
    this.field.on('cardSelected', (card: Card) => {
      console.log('[Guest] Field card selected:', card.cardData.id);
      if (!this.gameSync) {
        console.warn('[Guest] gameSync is null, cannot send field selection');
        return;
      }

      // selectionContext가 있고, 내가 선택해야 하는 상황인지 체크
      const state = this.lastReceivedGameState;
      if (!state) {
        console.warn('[Guest] No game state available');
        return;
      }

      const currentUserId = getCurrentUserId();
      const isLocalHost = this.multiplayerPlayers && currentUserId === this.multiplayerPlayers.host.id;

      // selectionContext가 있으면 2장 매칭 선택 상황
      if (state.selectionContext) {
        // requiredFor가 opponent면 게스트가 선택해야 함 (호스트 관점)
        const needsMySelection = isLocalHost
          ? state.selectionContext.requiredFor === 'player'
          : state.selectionContext.requiredFor === 'opponent';

        if (!needsMySelection) {
          console.warn('[Guest] Selection is not required for me');
          if (this.hud) {
            this.hud.showNotification('상대방이 선택 중입니다.');
          }
          return;
        }

        // 선택 가능한 카드인지 확인
        const isValidSelection = state.selectionContext.options.some(opt => opt.id === card.cardData.id);
        if (!isValidSelection) {
          console.warn('[Guest] Selected card is not in valid options');
          if (this.hud) {
            this.hud.showNotification('선택할 수 없는 카드입니다.');
          }
          return;
        }

        console.log('[Guest] Valid field selection, sending to Firebase');
        this.field.clearAllHighlights();
        this.gameSync.selectFieldCard(card.cardData.id).then(() => {
          console.log('[Guest] SELECT_FIELD_CARD action sent successfully');
        }).catch((error) => {
          console.error('[Guest] Failed to send SELECT_FIELD_CARD action:', error);
          if (this.hud) {
            this.hud.showNotification('필드 카드를 선택할 수 없습니다.');
          }
        });
        return;
      }

      // selectionContext가 없는 경우 기존 로직 (일반 턴 체크)
      if (!this.isMyTurn()) {
        console.warn('[Guest] Not my turn for field selection, showing notification');
        if (this.hud) {
          this.hud.showNotification('상대방의 차례입니다.');
        }
        return;
      }

      console.log('[Guest] Sending SELECT_FIELD_CARD action to Firebase');
      this.gameSync.selectFieldCard(card.cardData.id).then(() => {
        console.log('[Guest] SELECT_FIELD_CARD action sent successfully');
      }).catch((error) => {
        console.error('[Guest] Failed to send SELECT_FIELD_CARD action:', error);
        if (this.hud) {
          this.hud.showNotification('필드 카드를 선택할 수 없습니다.');
        }
      });
    });

    console.log('[Guest] Event handlers setup complete');

    // 호스트의 카드 플레이 액션을 받아서 복제 카드로 애니메이션 실행
    // 중요: 실제 카드 상태는 변경하지 않음! applyRemoteState에서만 상태 변경
    this.gameSync.onOpponentAction(async (action) => {
      console.log('[Guest] Received host action:', action.type, action);

      if (action.type === 'PLAY_CARD') {
        // 호스트가 플레이한 카드 = 게스트 화면에서 opponentHand의 카드
        const card = this.opponentHand.getCards().find(c => c.cardData.id === action.cardId);
        if (card) {
          // 애니메이션 락 설정
          this.isAnimatingCard = true;

          console.log('[Guest] Playing animation for host card:', action.cardId);
          const cardGlobalPos = card.getGlobalPosition();

          // 복제 카드 생성 (실제 카드는 건드리지 않음!)
          const animClone = card.createAnimationClone();
          animClone.showFront();

          // 실제 카드를 즉시 숨김 (applyRemoteState가 나중에 처리)
          card.visible = false;

          // 매칭 카드 확인
          const matchingCards = this.field.getMatchingCards(card.getMonth());

          // 복제 카드로 애니메이션 실행 후 자동 제거
          if (matchingCards.length === 0 || matchingCards.length === 3) {
            // 매칭 없거나 뻑 - 바닥으로 이동
            const fieldPos = this.field.getGlobalPosition();
            this.animationLayer.addChild(animClone);
            const localPos = this.animationLayer.toLocal(cardGlobalPos);
            animClone.position.set(localPos.x, localPos.y);
            await animClone.animateAndDestroy(fieldPos.x, fieldPos.y);
          } else {
            // 매칭 - 첫 번째 카드와 애니메이션
            await animClone.matchAnimationAndDestroy(matchingCards[0], this.animationLayer, cardGlobalPos);
          }

          // 애니메이션 완료 후 락 해제 및 보류된 상태 적용
          this.isAnimatingCard = false;
          if (this.pendingStateUpdate) {
            console.log('[Guest] Applying deferred state update after host animation');
            const pendingState = this.pendingStateUpdate;
            this.pendingStateUpdate = null;
            this.applyRemoteState(pendingState);
          }
        }
      }
    });
  }

  private attachRoomListener(): void {
    if (!this.roomId) return;
    console.log(`[${this.multiplayerRole}] Attaching room listener for room:`, this.roomId);
    const db = getRealtimeDatabase();
    const roomRef = ref(db, `${FIREBASE_PATHS.ROOMS}/${this.roomId}`);
    this.roomWatcherUnsubscribe?.();
    this.roomWatcherUnsubscribe = onValue(roomRef, (snapshot) => {
      console.log(`[${this.multiplayerRole}] Room update received, exists:`, snapshot.exists());
      if (!snapshot.exists()) {
        this.handleRoomClosed();
        return;
      }

      const room = snapshot.val() as RoomData;
      console.log(`[${this.multiplayerRole}] Room status:`, room.status, 'hasGameState:', !!room.gameState);
      if (this.multiplayerRole === 'host') {
        this.handleHostRoomUpdate(room);
      } else if (this.multiplayerRole === 'guest') {
        this.handleGuestRoomUpdate(room);
      }
    });
  }

  private handleRoomClosed(): void {
    this.roomWatcherUnsubscribe?.();
    this.roomWatcherUnsubscribe = null;
    if (this.hud) {
      this.hud.showNotification('게임방이 종료되었습니다. 로비로 돌아갑니다.');
    }
    this.changeScene('lobby');
  }

  private handleHostRoomUpdate(room: RoomData): void {
    if (!this.multiplayerPlayers) return;

    if (room.joinRequest) {
      if (room.joinRequest.playerId !== this.activeJoinRequestId) {
        this.activeJoinRequestId = room.joinRequest.playerId;
        this.showJoinRequestPrompt(room.joinRequest);
      }
    } else if (this.activeJoinRequestId) {
      this.activeJoinRequestId = null;
      this.destroyJoinRequestPrompt();
    }

    if (room.status === 'waiting' && !room.joinRequest) {
      this.hasInitializedMultiplayerSystems = false;
      this.showWaitingOverlay('도전자를 기다리는 중 입니다...');
    }

    if (room.status === 'playing' && room.guest) {
      const guestName = room.guestName ?? this.multiplayerPlayers.guest?.name ?? 'Guest';
      void this.startHostMultiplayerMatch(room.guest, guestName);
    }
  }

  private handleGuestRoomUpdate(room: RoomData): void {
    const currentUserId = getCurrentUserId();

    // Only go back to lobby if:
    // 1. Room status changed back to waiting (host kicked or game ended), OR
    // 2. Guest was removed from the room (but not us still being the guest)
    const wasKickedOrLeft = room.guest !== currentUserId;
    const gameEnded = room.status === 'finished';
    const hostCancelled = room.status === 'waiting' && !room.guest;

    if (wasKickedOrLeft || gameEnded || hostCancelled) {
      if (this.hud) {
        if (gameEnded && this.multiplayerPlayers) {
          // 게스트가 게임 종료 시 결과 화면으로 이동
          // lastGameState에서 점수 정보를 가져옴
          const gameState = this.lastReceivedGameState;

          // 확장된 room 타입 (endGame에서 저장한 추가 필드들)
          const extendedRoom = room as RoomData & {
            winner?: string;
            winnerScore?: number;
            finalScores?: { player: number; opponent: number };
          };

          // 호스트 관점에서 winner 결정 (room.winner는 winnerId)
          const winnerId = extendedRoom.winner;
          const isHostWinner = winnerId === this.multiplayerPlayers.host.id;

          // 게스트 관점에서의 winner: 게스트가 이기면 'player', 지면 'opponent'
          const localWinner = isHostWinner ? 'opponent' : 'player';

          // Firebase에서 저장된 점수 가져오기 (finalScores: player=호스트, opponent=게스트)
          // 게스트 관점에서 매핑 (자신이 player)
          const playerScore = extendedRoom.finalScores?.opponent ?? gameState?.opponent?.score ?? 0;
          const opponentScore = extendedRoom.finalScores?.player ?? gameState?.player?.score ?? 0;

          // 승자의 최종 점수 (코인 정산용)
          const winnerScoreFromRoom = extendedRoom.winnerScore ?? Math.max(playerScore, opponentScore);

          const guestResult = {
            winner: localWinner,
            playerScore,
            opponentScore,
            playerCollected: {
              kwang: gameState?.opponent?.collected?.kwang?.length ?? 0,
              animal: gameState?.opponent?.collected?.animal?.length ?? 0,
              ribbon: gameState?.opponent?.collected?.ribbon?.length ?? 0,
              pi: gameState?.opponent?.collected?.pi?.length ?? 0,
            },
            opponentCollected: {
              kwang: gameState?.player?.collected?.kwang?.length ?? 0,
              animal: gameState?.player?.collected?.animal?.length ?? 0,
              ribbon: gameState?.player?.collected?.ribbon?.length ?? 0,
              pi: gameState?.player?.collected?.pi?.length ?? 0,
            },
            isMultiplayer: true,
            roomId: this.roomId,
            isHost: false,
            winnerId: winnerId ?? 'unknown',
            loserId: isHostWinner ? (this.multiplayerPlayers.guest?.id ?? 'unknown') : this.multiplayerPlayers.host.id,
            winnerName: isHostWinner ? this.multiplayerPlayers.host.name : (this.multiplayerPlayers.guest?.name ?? '나'),
            loserName: isHostWinner ? (this.multiplayerPlayers.guest?.name ?? '나') : this.multiplayerPlayers.host.name,
            roundNumber: room.roundNumber ?? 1,
            // 게스트 관점에서 ScoreBreakdown
            // 게스트가 승자면 playerScoreBreakdown에 winnerScore, 패자면 opponentScoreBreakdown에 winnerScore
            playerScoreBreakdown: localWinner === 'player'
              ? { total: winnerScoreFromRoom } as ScoreBreakdown
              : { total: playerScore } as ScoreBreakdown,
            opponentScoreBreakdown: localWinner === 'opponent'
              ? { total: winnerScoreFromRoom } as ScoreBreakdown
              : { total: opponentScore } as ScoreBreakdown,
          };

          console.log('[Guest] Game ended, navigating to result scene:', guestResult);
          this.changeScene('result', guestResult);
          return;
        }
        this.hud.showNotification('호스트가 게임을 종료했습니다. 로비로 돌아갑니다.');
      }
      this.changeScene('lobby');
    }
  }

  private async startHostMultiplayerMatch(guestId: string, guestName: string): Promise<void> {
    console.log('[Host] startHostMultiplayerMatch called, hasInitialized:', this.hasInitializedMultiplayerSystems);
    if (this.hasInitializedMultiplayerSystems) {
      console.log('[Host] Already initialized, skipping');
      return;
    }

    // 레이스 컨디션 방지: 플래그를 먼저 설정하여 중복 호출 방지
    this.hasInitializedMultiplayerSystems = true;
    console.log('[Host] Starting host multiplayer match with guest:', guestName);

    if (!this.multiplayerPlayers) {
      const currentUserId = getCurrentUserId() ?? 'host';
      this.multiplayerPlayers = {
        host: { id: currentUserId, name: 'Host' },
      };
    }

    this.multiplayerPlayers.guest = {
      id: guestId,
      name: guestName,
    };

    console.log('[Host] Calling initializeLocalGameSystems');
    await this.initializeLocalGameSystems(false);
    console.log('[Host] initializeLocalGameSystems completed, phase:', this.turnManager?.getPhase());

    // 호스트: 게스트의 액션을 수신하도록 리스너 설정
    this.setupHostOpponentActionListener();

    // 플레이어 이름 표시 (호스트: 자신이 player, 상대가 opponent)
    this.playerCollectedDisplay.setPlayerName(this.multiplayerPlayers.host.name);
    this.opponentCollectedDisplay.setPlayerName(guestName);

    // 게임 시작 시 즉시 상태를 한 번 동기화하여 게스트에게 초기 상태 전달
    await this.broadcastGameState();

    this.startHostSyncLoop();
    this.hideWaitingOverlay();
    this.destroyJoinRequestPrompt();
  }

  // 호스트: 게스트의 액션을 수신하여 처리
  private setupHostOpponentActionListener(): void {
    if (!this.gameSync || !this.turnManager) {
      console.warn('[Host] Cannot set up opponent action listener - missing gameSync or turnManager');
      return;
    }

    console.log('[Host] Setting up opponent action listener');

    this.gameSync.onOpponentAction(async (action) => {
      console.log('[Host] Received opponent action:', action.type, action);
      if (!this.turnManager) {
        console.warn('[Host] turnManager is null');
        return;
      }

      const currentTurn = this.turnManager.getCurrentTurn();
      const phase = this.turnManager.getPhase();
      console.log('[Host] Current turn:', currentTurn, 'Phase:', phase);

      // 상대방(게스트) 턴일 때만 카드 플레이 액션 처리
      // 필드 카드 선택은 selecting 상태에서도 처리
      if (action.type === 'PLAY_CARD' && currentTurn !== 'opponent') {
        console.warn('[Host] Received PLAY_CARD but it is not opponent turn. Current turn:', currentTurn, 'Phase:', phase);
        return;
      }

      switch (action.type) {
        case 'PLAY_CARD': {
          // 상대방이 플레이한 카드 찾기
          const opponentCards = this.opponentHand.getCards();
          console.log('[Host] Looking for card', action.cardId, 'in opponent hand. Available cards:', opponentCards.map(c => c.cardData.id));
          const card = opponentCards.find(c => c.cardData.id === action.cardId);
          if (card) {
            console.log('[Host] Found card, calling handleOpponentCardPlay');
            this.turnManager.handleOpponentCardPlay(card);
          } else {
            console.warn('[Host] Card not found in opponent hand:', action.cardId);
          }
          break;
        }
        case 'SELECT_FIELD_CARD': {
          // 필드 카드 선택 (2장 매칭 시 또는 뒷패 선택 시)
          console.log('[Host] Processing field card selection:', action.targetCardId, 'Phase:', phase);
          const fieldCard = this.field.getAllCards().find(c => c.cardData.id === action.targetCardId);
          if (fieldCard) {
            if (phase === 'selecting') {
              console.log('[Host] Found field card, calling handleOpponentFieldSelection');
              this.turnManager.handleOpponentFieldSelection(fieldCard);
            } else if (phase === 'deckSelecting') {
              console.log('[Host] Found field card, calling handleOpponentDeckCardSelection');
              await this.turnManager.handleOpponentDeckCardSelection(fieldCard);
            } else {
              console.warn('[Host] Field card selection received but phase is not selecting:', phase);
            }
          } else {
            console.warn('[Host] Field card not found:', action.targetCardId);
          }
          break;
        }
        case 'DECLARE_GO': {
          console.log('[Host] Processing DECLARE_GO');
          this.turnManager.declareGo();
          break;
        }
        case 'DECLARE_STOP': {
          console.log('[Host] Processing DECLARE_STOP');
          this.turnManager.declareStop();
          break;
        }
        case 'TIMEOUT_SKIP': {
          // 게스트가 자신의 턴에서 타임아웃됨 - 호스트가 처리
          console.log('[Host] Processing TIMEOUT_SKIP from guest');
          if (currentTurn === 'opponent') {
            this.hud?.showNotification('상대방 시간 초과! 턴이 넘어갑니다.');
            this.turnManager.forceSkipOpponentTurn();
          } else {
            console.warn('[Host] TIMEOUT_SKIP received but current turn is player, ignoring');
          }
          break;
        }
      }
    });
  }

  private async respondToJoinRequest(request: RoomJoinRequest, accept: boolean): Promise<void> {
    if (!this.roomId) return;
    const db = getRealtimeDatabase();
    const roomRef = ref(db, `${FIREBASE_PATHS.ROOMS}/${this.roomId}`);

    try {
      if (accept) {
        // IMPORTANT: Initialize game systems and broadcast state BEFORE updating room status
        // This ensures gameState exists in Firebase when guest enters GameScene
        await this.startHostMultiplayerMatch(request.playerId, request.playerName);

        // Now update room status to 'playing' - guest will enter GameScene and find gameState ready
        await update(roomRef, {
          guest: request.playerId,
          guestName: request.playerName,
          status: 'playing',
          joinRequest: null,
          lastActivityAt: Date.now(),
        });
      } else {
        await update(roomRef, {
          joinRequest: null,
          status: 'waiting',
          lastActivityAt: Date.now(),
        });
        this.showWaitingOverlay('도전자를 기다리는 중 입니다...');
      }
    } catch (error) {
      console.error('Failed to respond to join request', error);
      if (this.hud) {
        this.hud.showNotification('요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.');
      }
    }
  }

  private showWaitingOverlay(message: string): void {
    if (!this.waitingOverlay) {
      const overlay = new Container();
      overlay.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2);
      overlay.zIndex = LAYERS.MODAL;

      const dim = new Graphics();
      dim.rect(-GAME_WIDTH / 2, -GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT);
      dim.fill({ color: 0x000000, alpha: 0.5 });
      // Block all events when overlay is visible
      dim.eventMode = 'static';
      overlay.addChild(dim);

      const box = new Graphics();
      box.roundRect(-220, -80, 440, 160, 20);
      box.fill({ color: COLORS.SECONDARY, alpha: 0.95 });
      box.stroke({ width: 3, color: COLORS.PRIMARY });
      overlay.addChild(box);

      const text = new Text({
        text: message,
        style: new TextStyle({
          fontFamily: FONTS.PRIMARY,
          fontSize: 22,
          fontWeight: 'bold',
          fill: COLORS.TEXT,
          align: 'center',
        }),
      });
      text.anchor.set(0.5);
      overlay.addChild(text);

      this.waitingOverlay = overlay;
      this.waitingOverlayText = text;
      this.uiLayer.addChild(overlay);
    }

    if (this.waitingOverlayText) {
      this.waitingOverlayText.text = message;
    }

    if (this.waitingOverlay) {
      this.waitingOverlay.visible = true;
    }
  }

  private hideWaitingOverlay(): void {
    if (this.waitingOverlay) {
      this.waitingOverlay.visible = false;
    }
  }

  private destroyWaitingOverlay(): void {
    if (this.waitingOverlay) {
      this.uiLayer.removeChild(this.waitingOverlay);
      this.waitingOverlay.destroy({ children: true });
      this.waitingOverlay = null;
      this.waitingOverlayText = null;
    }
  }

  private showJoinRequestPrompt(request: RoomJoinRequest): void {
    this.destroyJoinRequestPrompt();

    const container = new Container();
    container.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    container.zIndex = LAYERS.MODAL;

    const dim = new Graphics();
    dim.rect(-GAME_WIDTH / 2, -GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT);
    dim.fill({ color: 0x000000, alpha: 0.6 });
    container.addChild(dim);

    const box = new Graphics();
    box.roundRect(-260, -150, 520, 300, 20);
    box.fill({ color: COLORS.SECONDARY, alpha: 0.95 });
    box.stroke({ width: 3, color: COLORS.PRIMARY });
    container.addChild(box);

    const title = new Text({
      text: '도전자가 입장을 요청했습니다',
      style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: 24,
        fontWeight: 'bold',
        fill: COLORS.TEXT,
      }),
    });
    title.anchor.set(0.5);
    title.position.set(0, -80);
    container.addChild(title);

    const message = new Text({
      text: `${request.playerName}님이 게임 참여를 희망합니다.\n게임을 시작할까요?`,
      style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: 18,
        fill: COLORS.TEXT,
        align: 'center',
      }),
    });
    message.anchor.set(0.5);
    message.position.set(0, -10);
    container.addChild(message);

    const acceptButton = new Button({
      text: '게임 시작',
      width: 200,
      height: 70,
      backgroundColor: COLORS.PRIMARY,
      textColor: COLORS.TEXT,
      onClick: () => this.respondToJoinRequest(request, true),
    });
    acceptButton.position.set(-110, 90);
    container.addChild(acceptButton);

    const declineButton = new Button({
      text: '거절',
      width: 200,
      height: 70,
      backgroundColor: COLORS.SECONDARY,
      textColor: COLORS.TEXT,
      onClick: () => this.respondToJoinRequest(request, false),
    });
    declineButton.position.set(110, 90);
    container.addChild(declineButton);

    this.joinRequestPrompt = container;
    this.uiLayer.addChild(container);
  }

  private destroyJoinRequestPrompt(): void {
    if (this.joinRequestPrompt) {
      this.uiLayer.removeChild(this.joinRequestPrompt);
      this.joinRequestPrompt.destroy({ children: true });
      this.joinRequestPrompt = null;
    }
  }

  private isMyTurn(): boolean {
    if (!this.lastReceivedGameState || !this.multiplayerPlayers) {
      console.warn('[isMyTurn] Missing state or players:', {
        hasState: !!this.lastReceivedGameState,
        hasPlayers: !!this.multiplayerPlayers,
      });
      return false;
    }

    const currentUserId = getCurrentUserId();
    const isLocalHost = currentUserId === this.multiplayerPlayers.host.id;
    const state = this.lastReceivedGameState;

    // 호스트: state.currentTurn이 'player'면 내 턴
    // 게스트: state.currentTurn이 'opponent'면 내 턴 (호스트의 opponent = 게스트)
    const myTurn = isLocalHost ? state.currentTurn === 'player' : state.currentTurn === 'opponent';
    const phaseOK = state.phase !== 'waiting' && state.phase !== 'dealing';

    console.log('[isMyTurn] Full check:', {
      currentUserId,
      'host.id': this.multiplayerPlayers.host.id,
      isLocalHost,
      'state.currentTurn': state.currentTurn,
      'state.phase': state.phase,
      myTurn,
      phaseOK,
      finalResult: myTurn && phaseOK,
    });

    return myTurn && phaseOK;
  }

  private async applyRemoteState(state: GameState): Promise<void> {
    if (!this.multiplayerPlayers) {
      console.warn('[applyRemoteState] multiplayerPlayers is null, skipping');
      return;
    }

    console.log('[applyRemoteState] Received state:', state?.phase, state?.currentTurn);

    try {
      // Store the state for turn checking
      this.lastReceivedGameState = state;

      const currentUserId = getCurrentUserId();
      const isLocalHost = currentUserId === this.multiplayerPlayers.host.id;

      console.log('[applyRemoteState] isLocalHost:', isLocalHost, 'state.currentTurn:', state.currentTurn);

    const localState = isLocalHost ? state.player : state.opponent;
    const remoteState = isLocalHost ? state.opponent : state.player;

    // 플레이어 이름 표시 (GameState에서 이름 가져오기)
    // 호스트: player=자신, opponent=게스트
    // 게스트: player=호스트(상대방에서 가져옴), opponent=자신(로컬에서 가져옴)
    const localName = localState?.name ?? (isLocalHost ? '나' : '나');
    const remoteName = remoteState?.name ?? '상대';
    this.playerCollectedDisplay.setPlayerName(localName);
    this.opponentCollectedDisplay.setPlayerName(remoteName);

    console.log('[applyRemoteState] Setting names - local:', localName, 'remote:', remoteName);

    const normalizeHand = (hand?: CardData[]) => hand ?? [];
    const normalizeCollected = (collected?: PlayerState['collected']) => ({
      kwang: collected?.kwang ?? [],
      animal: collected?.animal ?? [],
      ribbon: collected?.ribbon ?? [],
      pi: collected?.pi ?? [],
    });

    const localHand = normalizeHand(localState?.hand);
    const remoteHand = normalizeHand(remoteState?.hand);
    const localCollected = normalizeCollected(localState?.collected);
    const remoteCollected = normalizeCollected(remoteState?.collected);

    // 게스트: 이미 애니메이션이 실행되었으므로 상태만 동기화
    this.playerHand.setCardsFromData(localHand, { showFront: true });
    this.opponentHand.setCardsFromData(remoteHand, { showFront: false });

    this.field.setCardsFromData(state.field ?? []);
    this.deck.setFromCardData(state.deck ?? []);

    this.playerCollectedDisplay.updateFromCardData(localCollected);
    this.opponentCollectedDisplay.updateFromCardData(remoteCollected);
    this.playerCollectedDisplay.updateTotalScore(localState?.score ?? 0);
    this.opponentCollectedDisplay.updateTotalScore(remoteState?.score ?? 0);

    const localCounts = {
      kwang: localCollected.kwang.length,
      animal: localCollected.animal.length,
      ribbon: localCollected.ribbon.length,
      pi: localCollected.pi.length,
    };
    const remoteCounts = {
      kwang: remoteCollected.kwang.length,
      animal: remoteCollected.animal.length,
      ribbon: remoteCollected.ribbon.length,
      pi: remoteCollected.pi.length,
    };

    this.hud.updateCollectedCounts(localCounts, remoteCounts);
    this.hud.updateScores({ player: localState?.score ?? 0, opponent: remoteState?.score ?? 0 });

    const localTurn = isLocalHost ? state.currentTurn : state.currentTurn === 'player' ? 'opponent' : 'player';
    console.log('[applyRemoteState] localTurn computed:', localTurn, '(state.currentTurn:', state.currentTurn, ', phase:', state.phase, ')');

    // 턴이 변경되었는지 확인 (게스트에서 턴 변경 시 타이머 리셋)
    const turnChanged = this.lastKnownTurn !== null && this.lastKnownTurn !== state.currentTurn;
    this.lastKnownTurn = state.currentTurn;

    // 턴이 변경되었으면 타이머 강제 리셋
    this.hud.updateTurn(localTurn, turnChanged);

    // 타이머 상태 동기화: phase에 따라 타이머 시작/중지
    // 플레이어/상대 턴, 선택 대기 상태에서만 타이머 실행
    // selecting/deckSelecting은 2장 매칭 선택 대기 상태 - 타임아웃 적용 필요
    const shouldRunTimer =
      state.phase === 'playerTurn' ||
      state.phase === 'opponentTurn' ||
      state.phase === 'selecting' ||
      state.phase === 'deckSelecting';
    if (shouldRunTimer) {
      this.hud.startTimer();
    } else {
      this.hud.stopTimer();
    }

    // Update turn indicators with animation
    const isPlayerTurn = localTurn === 'player' && state.phase !== 'waiting' && state.phase !== 'dealing';
    const isOpponentTurn = localTurn === 'opponent' && state.phase !== 'waiting' && state.phase !== 'dealing';

    this.playerCollectedDisplay.setTurnActive(isPlayerTurn);
    this.opponentCollectedDisplay.setTurnActive(isOpponentTurn);

    // 플레이어 턴일 때 손패 확인 및 알림
    if (isPlayerTurn) {
      console.log(`[applyRemoteState] It is my turn! localHand count: ${localHand.length}, phase: ${state.phase}`);

      // 내 턴인데 손패가 비어있는 경우 알림
      if (localHand.length === 0) {
        console.log('[applyRemoteState] My hand is empty on my turn - waiting for automatic deck draw');
        // 호스트가 자동으로 처리하므로 알림만 표시
        if (this.hud && state.phase !== 'resolving') {
          this.hud.showNotification('손패가 비어있어 덱에서 자동으로 뽑습니다...');
        }
      }
    }

    // 2장 매칭 선택 UI 처리 (게스트)
    // 먼저 모든 하이라이트 제거
    this.field.clearAllHighlights();

    if (state.selectionContext) {
      // 게스트 화면에서 누가 선택해야 하는지 확인
      // state.selectionContext.requiredFor는 호스트 관점 (player=호스트, opponent=게스트)
      const needsLocalSelection = isLocalHost
        ? state.selectionContext.requiredFor === 'player'
        : state.selectionContext.requiredFor === 'opponent';

      console.log('[applyRemoteState] selectionContext:', state.selectionContext, 'needsLocalSelection:', needsLocalSelection);

      if (needsLocalSelection) {
        // 내가 선택해야 함
        const typeText = state.selectionContext.type === 'hand' ? '손패로' : '뒷패로';
        this.hud.showNotification(`${typeText} 바닥패를 선택하세요`);

        // 선택 가능한 바닥패 하이라이트
        state.selectionContext.options.forEach(optionData => {
          const fieldCard = this.field.getAllCards().find(c => c.cardData.id === optionData.id);
          if (fieldCard) {
            fieldCard.setMatchHighlight(true);
          }
        });
      } else {
        // 상대가 선택 중
        this.hud.showNotification('상대가 바닥패를 선택 중...');

        // 상대가 선택할 바닥패도 하이라이트 (게스트 화면에서 시각적으로 표시)
        state.selectionContext.options.forEach(optionData => {
          const fieldCard = this.field.getAllCards().find(c => c.cardData.id === optionData.id);
          if (fieldCard) {
            fieldCard.setMatchHighlight(true);
          }
        });
      }
    }
    } catch (error) {
      console.error('[applyRemoteState] Error applying state:', error);
    }
  }
}
