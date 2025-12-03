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
import { GameState, GameAction, CardData } from '@utils/types';
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

    await update(this.gameStateRef, {
      lastAction: fullAction,
    });
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
    const lastActionRef = ref(
      this.database,
      `${FIREBASE_PATHS.ROOMS}/${this.roomId}/gameState/lastAction`
    );

    const unsubscribe = onValue(lastActionRef, (snapshot: DataSnapshot) => {
      if (snapshot.exists()) {
        const action = snapshot.val() as GameAction;
        // Only trigger for opponent's actions
        if (action.playerId !== userId) {
          callback(action);
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

  cleanup(): void {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
  }
}
