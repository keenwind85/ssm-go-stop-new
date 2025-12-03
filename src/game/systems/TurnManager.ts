import { EventEmitter } from 'pixi.js';
import { Deck } from '@game/objects/Deck';
import { Field } from '@game/objects/Field';
import { Hand } from '@game/objects/Hand';
import { Card } from '@game/objects/Card';
import { ScoreCalculator } from './ScoreCalculator';
import { GamePhase, ScoreBreakdown } from '@utils/types';
import { delay } from '@utils/helpers';

interface TurnManagerConfig {
  deck: Deck;
  field: Field;
  playerHand: Hand;
  opponentHand: Hand;
  scoreCalculator: ScoreCalculator;
  isAIMode: boolean;
  firstTurn?: 'player' | 'opponent'; // 멀티플레이어: 도전자(상대방)가 선공
}

export class TurnManager extends EventEmitter {
  private deck: Deck;
  private field: Field;
  private playerHand: Hand;
  private opponentHand: Hand;
  private scoreCalculator: ScoreCalculator;
  private isAIMode: boolean;
  private firstTurn: 'player' | 'opponent';

  private currentTurn: 'player' | 'opponent' = 'player';
  private phase: GamePhase = 'waiting';
  private turnNumber: number = 0;
  private selectedHandCard: Card | null = null;
  private pendingFieldCards: Card[] = [];
  private pendingDeckCard: Card | null = null;

  // Player collected cards
  private playerCollected: Card[] = [];
  private opponentCollected: Card[] = [];

  // Go count and special states
  private playerGoCount: number = 0;
  private opponentGoCount: number = 0;
  private playerHasShake: boolean = false;
  private opponentHasShake: boolean = false;
  private playerHasPpuk: boolean = false;
  private opponentHasPpuk: boolean = false;

  constructor(config: TurnManagerConfig) {
    super();
    this.deck = config.deck;
    this.field = config.field;
    this.playerHand = config.playerHand;
    this.opponentHand = config.opponentHand;
    this.scoreCalculator = config.scoreCalculator;
    this.isAIMode = config.isAIMode;
    this.firstTurn = config.firstTurn ?? 'player'; // 기본값: player 선공, 멀티플레이어: opponent(도전자) 선공
  }

  async dealInitialCards(): Promise<void> {
    this.phase = 'dealing';
    this.deck.shuffle();

    // Deal pattern: 5 to player, 4 to field, 5 to opponent (repeat twice)
    // Total: 10 cards per player, 8 cards on field, 20 cards remaining in deck
    for (let round = 0; round < 2; round++) {
      // Deal to player (5 cards per round = 10 total)
      const playerCards = this.deck.drawMultiple(5);
      for (const card of playerCards) {
        this.playerHand.addCard(card);
        await delay(80);
      }

      // Deal to field (4 cards per round = 8 total)
      const fieldCards = this.deck.drawMultiple(4);
      for (const card of fieldCards) {
        this.field.addCard(card);
        await delay(80);
      }

      // Deal to opponent (5 cards per round = 10 total)
      const opponentCards = this.deck.drawMultiple(5);
      for (const card of opponentCards) {
        this.opponentHand.addCard(card);
        await delay(80);
      }
    }

    // Sort player's hand
    this.playerHand.sortByMonth();

    // Check for initial shake/bomb
    await this.checkInitialSpecials();

    // Start first turn (멀티플레이어에서는 도전자=상대방 선공)
    this.startTurn(this.firstTurn);
  }

  // 초기 패에서 흔들기/폭탄 확인
  private async checkInitialSpecials(): Promise<void> {
    // Check player's hand
    const playerBomb = this.checkBomb(this.playerHand.getCards());
    if (playerBomb !== null) {
      this.emit('bomb', { player: 'player', month: playerBomb });
      // 폭탄: 즉시 해당 월 4장 모두 획득
      await this.handleBomb('player', playerBomb);
    }

    const playerShakes = this.checkShake(this.playerHand.getCards());
    if (playerShakes.length > 0) {
      this.playerHasShake = true;
      this.emit('shake', { player: 'player', months: playerShakes });
    }

    // Check opponent's hand
    const opponentBomb = this.checkBomb(this.opponentHand.getCards());
    if (opponentBomb !== null) {
      this.emit('bomb', { player: 'opponent', month: opponentBomb });
      await this.handleBomb('opponent', opponentBomb);
    }

    const opponentShakes = this.checkShake(this.opponentHand.getCards());
    if (opponentShakes.length > 0) {
      this.opponentHasShake = true;
      this.emit('shake', { player: 'opponent', months: opponentShakes });
    }
  }

  // 폭탄 확인 (같은 월 4장)
  private checkBomb(cards: Card[]): number | null {
    const monthCounts: Record<number, number> = {};
    cards.forEach(card => {
      const month = card.getMonth();
      monthCounts[month] = (monthCounts[month] || 0) + 1;
    });

    for (const [month, count] of Object.entries(monthCounts)) {
      if (count === 4) {
        return parseInt(month);
      }
    }
    return null;
  }

  // 흔들기 확인 (같은 월 3장)
  private checkShake(cards: Card[]): number[] {
    const monthCounts: Record<number, number> = {};
    cards.forEach(card => {
      const month = card.getMonth();
      monthCounts[month] = (monthCounts[month] || 0) + 1;
    });

    const shakeMonths: number[] = [];
    for (const [month, count] of Object.entries(monthCounts)) {
      if (count === 3) {
        shakeMonths.push(parseInt(month));
      }
    }
    return shakeMonths;
  }

  // 폭탄 처리 (해당 월 4장 모두 획득)
  private async handleBomb(player: 'player' | 'opponent', month: number): Promise<void> {
    const hand = player === 'player' ? this.playerHand : this.opponentHand;
    const cards = hand.getCards().filter(card => card.getMonth() === month);

    // 바닥에서도 해당 월 카드 가져오기
    const fieldCards = this.field.getMatchingCards(month);

    const allCards = [...cards, ...fieldCards];

    // 손에서 제거
    cards.forEach(card => hand.removeCard(card));

    // 획득
    this.collectCards(player, allCards);

    await delay(500);
  }

  private startTurn(player: 'player' | 'opponent'): void {
    this.currentTurn = player;
    this.phase = player === 'player' ? 'playerTurn' : 'opponentTurn';
    this.turnNumber++;
    this.selectedHandCard = null;
    this.pendingFieldCards = [];

    this.emit('turnStart', player);

    const hand = player === 'player' ? this.playerHand : this.opponentHand;

    // If hand is empty but deck has cards, draw from deck only
    if (!hand.hasCards() && this.deck.getRemainingCount() > 0) {
      this.performDeckOnlyTurn(player);
      return;
    }

    if (player === 'opponent' && this.isAIMode) {
      this.performAITurn();
    }
  }

  // When hand is empty, only draw from deck to match field cards
  private async performDeckOnlyTurn(player: 'player' | 'opponent'): Promise<void> {
    this.phase = 'resolving';
    this.emit('resolving');

    await delay(500);

    // Draw from deck and try to match
    await this.drawFromDeck(player);

    // Check for game end
    if (this.checkGameEnd()) return;

    // End turn
    this.endTurn();
  }

  private async performAITurn(): Promise<void> {
    await delay(1000); // Thinking delay

    const opponentCards = this.opponentHand.getCards();
    if (opponentCards.length === 0) {
      this.checkGameEnd();
      return;
    }

    // Simple AI: Play first matching card or random card
    let cardToPlay: Card | null = null;

    for (const card of opponentCards) {
      if (this.field.hasMatch(card.getMonth())) {
        cardToPlay = card;
        break;
      }
    }

    if (!cardToPlay) {
      cardToPlay = opponentCards[0];
    }

    await this.playCard(cardToPlay, 'opponent');
  }

  handleCardPlay(card: Card): void {
    if (this.phase !== 'playerTurn') return;

    this.selectedHandCard = card;
    const matchingCards = this.field.getMatchingCards(card.getMonth());

    if (matchingCards.length === 0) {
      // No match - card goes to field
      this.playCard(card, 'player');
    } else if (matchingCards.length === 1) {
      // One match - auto collect
      this.pendingFieldCards = matchingCards;
      this.playCard(card, 'player');
    } else if (matchingCards.length === 3) {
      // Three matches - 뻑(Ppuk): card goes to field, wait for deck draw
      this.pendingFieldCards = []; // Clear - don't collect from hand play
      this.playCard(card, 'player');
      this.emit('ppukPending', card.getMonth());
    } else {
      // Two matches - player must choose
      this.phase = 'selecting';
      this.pendingFieldCards = matchingCards;
      this.emit('requireFieldSelection', matchingCards);
    }
  }

  handleFieldCardSelection(fieldCard: Card): void {
    if (this.phase !== 'selecting' || !this.selectedHandCard) return;

    this.pendingFieldCards = [fieldCard];
    this.playCard(this.selectedHandCard, 'player');
  }

  // 멀티플레이어: 상대방(게스트)의 카드 플레이 처리 (호스트에서 호출)
  handleOpponentCardPlay(card: Card): void {
    if (this.phase !== 'opponentTurn') return;

    this.selectedHandCard = card;
    const matchingCards = this.field.getMatchingCards(card.getMonth());

    if (matchingCards.length === 0) {
      // No match - card goes to field
      this.playCard(card, 'opponent');
    } else if (matchingCards.length === 1) {
      // One match - auto collect
      this.pendingFieldCards = matchingCards;
      this.playCard(card, 'opponent');
    } else if (matchingCards.length === 3) {
      // Three matches - 뻑(Ppuk): card goes to field, wait for deck draw
      this.pendingFieldCards = [];
      this.playCard(card, 'opponent');
      this.emit('ppukPending', card.getMonth());
    } else {
      // Two matches - opponent must choose (호스트에서 선택 요청 이벤트 발생)
      this.phase = 'selecting';
      this.pendingFieldCards = matchingCards;
      this.emit('requireOpponentFieldSelection', matchingCards);
    }
  }

  // 멀티플레이어: 상대방(게스트)의 필드 카드 선택 처리
  handleOpponentFieldSelection(fieldCard: Card): void {
    if (this.phase !== 'selecting' || !this.selectedHandCard) return;

    this.pendingFieldCards = [fieldCard];
    this.playCard(this.selectedHandCard, 'opponent');
  }

  // 멀티플레이어: 상대방의 뒷패 카드 선택 처리
  handleOpponentDeckCardSelection(fieldCard: Card): void {
    if (this.phase !== 'deckSelecting' || !this.pendingDeckCard) return;

    this.collectCards('opponent', [this.pendingDeckCard, fieldCard]);
    this.pendingDeckCard = null;
    this.pendingFieldCards = [];
    this.finishTurnAfterDraw();
  }

  private async playCard(card: Card, player: 'player' | 'opponent'): Promise<void> {
    this.phase = 'resolving';
    this.emit('resolving');

    const hand = player === 'player' ? this.playerHand : this.opponentHand;
    hand.removeCard(card);

    const matchingCards = this.pendingFieldCards.length > 0
      ? this.pendingFieldCards
      : this.field.getMatchingCards(card.getMonth());

    if (matchingCards.length === 0) {
      // No match - add to field with animation
      await this.animateCardToField(card);
      this.field.addCard(card);
    } else if (matchingCards.length === 3 || (this.pendingFieldCards.length === 0 && this.field.getMatchingCards(card.getMonth()).length === 3)) {
      // 뻑(Ppuk) - 3 cards on field, add hand card to field instead of collecting
      // Collection will happen in deck draw phase if deck card matches
      await this.animateCardToField(card);
      this.field.addCard(card);
    } else {
      // Animate card to match with field card
      if (matchingCards.length > 0) {
        await card.matchWithCard(matchingCards[0]);
      }
      // Collect matching cards
      this.collectCards(player, [card, ...matchingCards]);
    }

    // Draw from deck
    const needsSelection = await this.drawFromDeck(player);

    // deckSelecting 상태가 아니면 턴 종료 처리
    if (!needsSelection) {
      await this.finishTurnAfterDraw();
    }
  }

  private async animateCardToField(card: Card): Promise<void> {
    // Add card to field layer temporarily for animation
    const fieldPos = this.field.getGlobalPosition();
    await card.moveTo(fieldPos.x, fieldPos.y);
  }

  private async drawFromDeck(player: 'player' | 'opponent'): Promise<boolean> {
    const drawnCard = this.deck.draw();
    if (!drawnCard) return false;

    await delay(300);

    const matchingCards = this.field.getMatchingCards(drawnCard.getMonth());

    if (matchingCards.length === 0) {
      // No match - add to field
      this.field.addCard(drawnCard);
    } else if (matchingCards.length === 1) {
      // One match - collect
      this.collectCards(player, [drawnCard, matchingCards[0]]);
    } else if (matchingCards.length >= 3) {
      // Three or more - take all (뻑)
      if (player === 'player') {
        this.playerHasPpuk = true;
      } else {
        this.opponentHasPpuk = true;
      }
      this.collectCards(player, [drawnCard, ...matchingCards]);
      this.emit('ppuk', player);
    } else {
      // Two matches - need selection
      if (player === 'player' && !this.isAIMode) {
        // 플레이어: 선택 필요
        this.pendingDeckCard = drawnCard;
        this.pendingFieldCards = matchingCards;
        this.phase = 'deckSelecting';
        this.emit('requireDeckSelection', { card: drawnCard, matchingCards });
        return true; // 선택을 기다림
      } else {
        // AI: 첫 번째 카드 선택
        this.collectCards(player, [drawnCard, matchingCards[0]]);
      }
    }
    return false;
  }

  // 뒷패 카드로 바닥패 2장 중 선택
  handleDeckCardSelection(fieldCard: Card): void {
    if (this.phase !== 'deckSelecting' || !this.pendingDeckCard) return;

    const player = this.currentTurn;
    this.collectCards(player, [this.pendingDeckCard, fieldCard]);

    this.pendingDeckCard = null;
    this.pendingFieldCards = [];

    // 턴 종료 진행
    this.finishTurnAfterDraw();
  }

  private async finishTurnAfterDraw(): Promise<void> {
    // Check for game end
    if (this.checkGameEnd()) return;

    // Check for Go/Stop opportunity
    const canGoStop = this.checkGoStopOpportunity();
    if (canGoStop) {
      return; // Go/Stop 선택을 기다림
    }

    // End turn
    this.endTurn();
  }

  // Go/Stop 기회 확인
  private checkGoStopOpportunity(): boolean {
    const player = this.currentTurn;
    const collected = player === 'player' ? this.playerCollected : this.opponentCollected;
    const goCount = player === 'player' ? this.playerGoCount : this.opponentGoCount;
    const previousScore = player === 'player' ? this.playerPreviousScore : this.opponentPreviousScore;

    const score = this.scoreCalculator.calculate(collected);

    // 7점 이상이고, 첫 번째 고이거나 이전 점수보다 높아야 함
    if (score.total >= 7 && (goCount === 0 || score.total > previousScore)) {
      this.phase = 'goStop';
      this.emit('goStopDecision', { player, score: score.total, goCount });

      // AI는 자동으로 결정
      if (player === 'opponent' && this.isAIMode) {
        // 간단한 AI 로직: 7점 이상이면 스톱, 아니면 고
        setTimeout(() => {
          if (score.total >= 7) {
            this.declareStop();
          } else {
            this.declareGo();
          }
        }, 1000);
      }
      return true;
    }
    return false;
  }

  // 이전 점수 저장용 (고/스톱 비교용)
  private playerPreviousScore: number = 0;
  private opponentPreviousScore: number = 0;

  // 고 선언
  declareGo(): void {
    if (this.phase !== 'goStop') return;

    const player = this.currentTurn;
    if (player === 'player') {
      this.playerPreviousScore = this.scoreCalculator.calculate(this.playerCollected).total;
      this.playerGoCount++;
      this.emit('goDeclared', { player: 'player', count: this.playerGoCount });
    } else {
      this.opponentPreviousScore = this.scoreCalculator.calculate(this.opponentCollected).total;
      this.opponentGoCount++;
      this.emit('goDeclared', { player: 'opponent', count: this.opponentGoCount });
    }

    // 다음 턴으로
    this.endTurn();
  }

  // 스톱 선언
  declareStop(): void {
    if (this.phase !== 'goStop') return;

    const player = this.currentTurn;
    const collected = player === 'player' ? this.playerCollected : this.opponentCollected;
    const opponentCollected = player === 'player' ? this.opponentCollected : this.playerCollected;
    const goCount = player === 'player' ? this.playerGoCount : this.opponentGoCount;
    const hasShake = player === 'player' ? this.playerHasShake : this.opponentHasShake;
    const hasPpuk = player === 'player' ? this.playerHasPpuk : this.opponentHasPpuk;

    // 상대방의 점수 정보 (피박, 광박 계산용)
    const opponentBaseScore = this.scoreCalculator.calculate(opponentCollected);
    const baseScore = this.scoreCalculator.calculate(collected);
    const finalScore = this.scoreCalculator.applyMultipliers(
      baseScore, goCount, hasShake, hasPpuk,
      opponentBaseScore.piCount, opponentBaseScore.kwangCount
    );

    this.phase = 'gameOver';
    this.emit('stopDeclared', { player, score: finalScore });

    // 각 플레이어의 최종 점수 계산 (상대방 기준 피박/광박 적용)
    const playerBaseScore = this.scoreCalculator.calculate(this.playerCollected);
    const opponentFinalBaseScore = this.scoreCalculator.calculate(this.opponentCollected);

    this.emit('gameEnd', {
      winner: player,
      playerScore: this.scoreCalculator.applyMultipliers(
        playerBaseScore,
        this.playerGoCount,
        this.playerHasShake,
        this.playerHasPpuk,
        opponentFinalBaseScore.piCount,
        opponentFinalBaseScore.kwangCount
      ),
      opponentScore: this.scoreCalculator.applyMultipliers(
        opponentFinalBaseScore,
        this.opponentGoCount,
        this.opponentHasShake,
        this.opponentHasPpuk,
        playerBaseScore.piCount,
        playerBaseScore.kwangCount
      ),
    });
  }

  // 고/스톱 선택 대기 중인지 확인
  isWaitingForGoStop(): boolean {
    return this.phase === 'goStop';
  }

  private collectCards(player: 'player' | 'opponent', cards: Card[]): void {
    const collected = player === 'player' ? this.playerCollected : this.opponentCollected;

    cards.forEach(card => {
      this.field.removeCard(card);
      collected.push(card);
      // Hide collected cards (they're counted in HUD)
      card.visible = false;
    });

    // Calculate and update scores
    this.updateScores();

    // Update collected counts in HUD
    this.emitCollectedUpdate();
  }

  private emitCollectedUpdate(): void {
    const playerCounts = this.countCardTypes(this.playerCollected);
    const opponentCounts = this.countCardTypes(this.opponentCollected);

    this.emit('collectedUpdate', {
      player: playerCounts,
      opponent: opponentCounts,
      playerCards: this.groupCardsByType(this.playerCollected),
      opponentCards: this.groupCardsByType(this.opponentCollected),
    });
  }

  private groupCardsByType(cards: Card[]): { kwang: Card[]; animal: Card[]; ribbon: Card[]; pi: Card[] } {
    const groups: { kwang: Card[]; animal: Card[]; ribbon: Card[]; pi: Card[] } = {
      kwang: [],
      animal: [],
      ribbon: [],
      pi: [],
    };

    cards.forEach(card => {
      const type = card.getType();
      if (type in groups) {
        groups[type].push(card);
      }
    });

    return groups;
  }

  private countCardTypes(cards: Card[]): { kwang: number; animal: number; ribbon: number; pi: number } {
    const counts = { kwang: 0, animal: 0, ribbon: 0, pi: 0 };

    cards.forEach(card => {
      switch (card.getType()) {
        case 'kwang':
          counts.kwang++;
          break;
        case 'animal':
          counts.animal++;
          break;
        case 'ribbon':
          counts.ribbon++;
          break;
        case 'pi':
          counts.pi++;
          break;
      }
    });

    return counts;
  }

  private updateScores(): void {
    const playerScore = this.scoreCalculator.calculate(this.playerCollected);
    const opponentScore = this.scoreCalculator.calculate(this.opponentCollected);

    this.emit('scoreUpdate', {
      player: playerScore.total,
      opponent: opponentScore.total,
    });
  }

  private endTurn(): void {
    this.emit('turnEnd', this.currentTurn);

    // Switch turn
    const nextPlayer = this.currentTurn === 'player' ? 'opponent' : 'player';
    this.startTurn(nextPlayer);
  }

  // Force skip turn when timeout occurs (player didn't make a move in time)
  async forceSkipTurn(): Promise<void> {
    if (this.phase !== 'playerTurn') return;

    this.phase = 'resolving';
    this.emit('resolving');
    this.selectedHandCard = null;
    this.pendingFieldCards = [];
    this.pendingDeckCard = null;

    // Clear any selection
    this.playerHand.clearSelection();
    this.field.clearAllHighlights();

    // Just draw from deck for this turn (penalty for timeout)
    await delay(500);
    const needsSelection = await this.drawFromDeck('player');

    // 뒷패 선택이 필요하지 않으면 턴 종료 처리
    if (!needsSelection) {
      await this.finishTurnAfterDraw();
    }
  }

  private checkGameEnd(): boolean {
    // Game ends when deck is empty and both players have no cards
    const deckEmpty = this.deck.getRemainingCount() === 0;
    const playerEmpty = !this.playerHand.hasCards();
    const opponentEmpty = !this.opponentHand.hasCards();

    if (deckEmpty && playerEmpty && opponentEmpty) {
      this.endGame();
      return true;
    }

    return false;
  }

  private endGame(): void {
    this.phase = 'gameOver';

    const playerBaseScore = this.scoreCalculator.calculate(this.playerCollected);
    const opponentBaseScore = this.scoreCalculator.calculate(this.opponentCollected);

    // 배수 적용 (상대방 기준 피박/광박 적용)
    const playerScore = this.scoreCalculator.applyMultipliers(
      playerBaseScore,
      this.playerGoCount,
      this.playerHasShake,
      this.playerHasPpuk,
      opponentBaseScore.piCount,
      opponentBaseScore.kwangCount
    );
    const opponentScore = this.scoreCalculator.applyMultipliers(
      opponentBaseScore,
      this.opponentGoCount,
      this.opponentHasShake,
      this.opponentHasPpuk,
      playerBaseScore.piCount,
      playerBaseScore.kwangCount
    );

    // 무승부(나가리) 확인
    if (playerScore.total === opponentScore.total) {
      this.emit('gameEnd', {
        winner: null, // 무승부
        playerScore,
        opponentScore,
        isDraw: true,
      });
      return;
    }

    const winner = playerScore.total > opponentScore.total ? 'player' : 'opponent';

    this.emit('gameEnd', {
      winner,
      playerScore,
      opponentScore,
      isDraw: false,
    });
  }

  isPlayerTurn(): boolean {
    return this.phase === 'playerTurn';
  }

  isWaitingForFieldSelection(): boolean {
    return this.phase === 'selecting';
  }

  isWaitingForDeckSelection(): boolean {
    return this.phase === 'deckSelecting';
  }

  getCurrentTurn(): 'player' | 'opponent' {
    return this.currentTurn;
  }

  getPhase(): GamePhase {
    return this.phase;
  }

  getTurnNumber(): number {
    return this.turnNumber;
  }

  getCollectedCards(player: 'player' | 'opponent'): Card[] {
    return player === 'player' ? [...this.playerCollected] : [...this.opponentCollected];
  }

  getGoCount(player: 'player' | 'opponent'): number {
    return player === 'player' ? this.playerGoCount : this.opponentGoCount;
  }

  hasShake(player: 'player' | 'opponent'): boolean {
    return player === 'player' ? this.playerHasShake : this.opponentHasShake;
  }

  hasPpuk(player: 'player' | 'opponent'): boolean {
    return player === 'player' ? this.playerHasPpuk : this.opponentHasPpuk;
  }

  getScoreBreakdown(player: 'player' | 'opponent'): ScoreBreakdown {
    if (player === 'player') {
      return this.scoreCalculator.calculate(this.playerCollected);
    }
    return this.scoreCalculator.calculate(this.opponentCollected);
  }

  update(_deltaTime: number): void {
    // Update game logic if needed
  }
}
