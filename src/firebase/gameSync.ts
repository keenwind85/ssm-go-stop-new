import {
  ref,
  set,
  get,
  update,
  onValue,
  DataSnapshot,
} from 'firebase/database';
import { getRealtimeDatabase } from './config';
import { getCurrentUserId } from './auth';
import { settleGameCoins, getUserCoins } from './coinService';
import { GameState, GameAction, CardData, ContinueGameConsent } from '@utils/types';
import { FIREBASE_PATHS } from '@utils/constants';

export class GameSync {
  private database = getRealtimeDatabase();
  private roomId: string;
  private unsubscribers: (() => void)[] = [];

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  private get gameStateRef() {
    return ref(this.database, `${FIREBASE_PATHS.ROOMS}/${this.roomId}/gameState`);
  }

  async initializeGameState(initialState: GameState): Promise<void> {
    await set(this.gameStateRef, initialState);
  }

  async getGameState(): Promise<GameState | null> {
    const snapshot = await get(this.gameStateRef);
    return snapshot.exists() ? (snapshot.val() as GameState) : null;
  }

  async updateGameState(updates: Partial<GameState>): Promise<void> {
    await update(this.gameStateRef, updates);
  }

  async sendAction(action: Omit<GameAction, 'playerId' | 'timestamp'>): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const fullAction: GameAction = {
      ...action,
      playerId: userId,
      timestamp: Date.now(),
    };

    // Remove undefined fields - Firebase doesn't accept undefined values
    const cleanAction = Object.entries(fullAction).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, unknown>);

    console.log('[GameSync] Sending action to Firebase:', cleanAction);
    try {
      await update(this.gameStateRef, {
        lastAction: cleanAction,
      });
      console.log('[GameSync] Action sent successfully');
    } catch (error) {
      console.error('[GameSync] Failed to send action:', error);
      throw error;
    }
  }

  async playCard(cardId: string, options?: { targetMonth?: number; targetCardId?: string }): Promise<void> {
    await this.sendAction({
      type: 'PLAY_CARD',
      cardId,
      targetMonth: options?.targetMonth,
      targetCardId: options?.targetCardId,
    });
  }

  async selectFieldCard(cardId: string): Promise<void> {
    await this.sendAction({
      type: 'SELECT_FIELD_CARD',
      targetCardId: cardId,
    });
  }

  async declareGo(): Promise<void> {
    await this.sendAction({
      type: 'DECLARE_GO',
    });
  }

  async declareStop(): Promise<void> {
    await this.sendAction({
      type: 'DECLARE_STOP',
    });
  }

  onGameStateChange(callback: (state: GameState) => void): void {
    const unsubscribe = onValue(this.gameStateRef, (snapshot: DataSnapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val() as GameState);
      }
    });

    this.unsubscribers.push(unsubscribe);
  }

  onOpponentAction(callback: (action: GameAction) => void): void {
    const userId = getCurrentUserId();
    console.log('[GameSync] Setting up onOpponentAction listener for user:', userId);
    const lastActionRef = ref(
      this.database,
      `${FIREBASE_PATHS.ROOMS}/${this.roomId}/gameState/lastAction`
    );

    const unsubscribe = onValue(lastActionRef, (snapshot: DataSnapshot) => {
      if (snapshot.exists()) {
        const action = snapshot.val() as GameAction;
        console.log('[GameSync] Received lastAction update:', action, 'My userId:', userId);
        // Only trigger for opponent's actions
        if (action.playerId !== userId) {
          console.log('[GameSync] This is opponent action, triggering callback');
          callback(action);
        } else {
          console.log('[GameSync] This is my own action, ignoring');
        }
      }
    });

    this.unsubscribers.push(unsubscribe);
  }

  async syncPlayerHand(hand: CardData[]): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) return;

    const handRef = ref(
      this.database,
      `${FIREBASE_PATHS.ROOMS}/${this.roomId}/gameState/hands/${userId}`
    );
    await set(handRef, hand);
  }

  async syncField(field: CardData[]): Promise<void> {
    await update(this.gameStateRef, { field });
  }

  async syncCollected(
    playerId: string,
    collected: { kwang: CardData[]; animal: CardData[]; ribbon: CardData[]; pi: CardData[] }
  ): Promise<void> {
    const collectedRef = ref(
      this.database,
      `${FIREBASE_PATHS.ROOMS}/${this.roomId}/gameState/collected/${playerId}`
    );
    await set(collectedRef, collected);
  }

  async endGame(winnerId: string, finalScores: { player: number; opponent: number }): Promise<void> {
    await update(ref(this.database, `${FIREBASE_PATHS.ROOMS}/${this.roomId}`), {
      status: 'finished',
      winner: winnerId,
      finalScores,
      endedAt: Date.now(),
    });
  }

  /**
   * 게임 종료 후 코인 정산
   * @param winnerId 승자 ID
   * @param loserId 패자 ID
   * @param winnerScore 승자 점수 (점수 곱하기 룰 적용된 최종 점수)
   */
  async settleCoins(
    winnerId: string,
    loserId: string,
    winnerScore: number
  ): Promise<{
    success: boolean;
    winnerCoins: number;
    loserCoins: number;
    transferAmount: number;
    loserBankrupt: boolean;
  }> {
    const result = await settleGameCoins(winnerId, loserId, winnerScore, this.roomId);

    // 코인 정보를 방에 기록
    if (result.success) {
      await update(ref(this.database, `${FIREBASE_PATHS.ROOMS}/${this.roomId}`), {
        lastGameResult: {
          winnerId,
          winnerScore,
          loserScore: 0, // 패자 점수는 정산에 사용되지 않음
          coinTransfer: result.transferAmount,
        },
        hostCoins: winnerId === (await this.getHostId()) ? result.winnerCoins : result.loserCoins,
        guestCoins: winnerId === (await this.getHostId()) ? result.loserCoins : result.winnerCoins,
      });
    }

    return result;
  }

  private async getHostId(): Promise<string> {
    const roomRef = ref(this.database, `${FIREBASE_PATHS.ROOMS}/${this.roomId}/host`);
    const snapshot = await get(roomRef);
    return snapshot.val() as string;
  }

  /**
   * 연속 게임 동의 요청
   */
  async requestContinueGame(roundNumber: number): Promise<void> {
    await update(ref(this.database, `${FIREBASE_PATHS.ROOMS}/${this.roomId}`), {
      status: 'waiting_consent',
      continueConsent: {
        hostConsent: undefined,
        guestConsent: undefined,
        roundNumber,
      } as ContinueGameConsent,
    });
  }

  /**
   * 연속 게임 동의 응답
   */
  async respondContinueGame(isHost: boolean, consent: boolean): Promise<void> {
    const consentField = isHost ? 'continueConsent/hostConsent' : 'continueConsent/guestConsent';
    await update(ref(this.database, `${FIREBASE_PATHS.ROOMS}/${this.roomId}`), {
      [consentField]: consent,
    });
  }

  /**
   * 연속 게임 동의 상태 감시
   */
  onContinueConsentChange(callback: (consent: ContinueGameConsent | null) => void): void {
    const consentRef = ref(this.database, `${FIREBASE_PATHS.ROOMS}/${this.roomId}/continueConsent`);
    const unsubscribe = onValue(consentRef, (snapshot: DataSnapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val() as ContinueGameConsent);
      } else {
        callback(null);
      }
    });
    this.unsubscribers.push(unsubscribe);
  }

  /**
   * 새 라운드 시작
   */
  async startNewRound(roundNumber: number): Promise<void> {
    // 현재 호스트/게스트 코인 업데이트
    const roomRef = ref(this.database, `${FIREBASE_PATHS.ROOMS}/${this.roomId}`);
    const roomSnapshot = await get(roomRef);
    const room = roomSnapshot.val();

    const hostCoins = await getUserCoins(room.host);
    const guestCoins = room.guest ? await getUserCoins(room.guest) : 0;

    await update(roomRef, {
      status: 'playing',
      roundNumber,
      continueConsent: null,
      lastGameResult: null,
      gameState: null, // 게임 상태 초기화
      hostCoins,
      guestCoins,
    });
  }

  /**
   * 게임 방 종료 (연속 게임 거부 또는 코인 소진)
   */
  async closeRoom(reason: string): Promise<void> {
    await update(ref(this.database, `${FIREBASE_PATHS.ROOMS}/${this.roomId}`), {
      status: 'finished',
      closeReason: reason,
      endedAt: Date.now(),
    });
  }

  cleanup(): void {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
  }
}
