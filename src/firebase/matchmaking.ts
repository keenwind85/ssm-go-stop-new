import {
  ref,
  set,
  get,
  remove,
  onValue,
  onDisconnect,
  update,
  query,
  orderByChild,
  equalTo,
  limitToFirst,
  DataSnapshot,
  type DatabaseReference,
} from 'firebase/database';
import { getRealtimeDatabase } from './config';
import { getCurrentUserId } from './auth';
import { RoomData } from '@utils/types';
import { FIREBASE_PATHS } from '@utils/constants';
import { generateId } from '@utils/helpers';

export class Matchmaking {
  private database = getRealtimeDatabase();
  private currentRoomId: string | null = null;
  private unsubscribers: (() => void)[] = [];

  async findMatch(): Promise<string> {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    // Look for waiting rooms
    const roomsRef = ref(this.database, FIREBASE_PATHS.ROOMS);
    const waitingRoomId = await this.findWaitingRoomId(roomsRef);

    if (waitingRoomId) {
      await this.joinRoom(waitingRoomId);
      return waitingRoomId;
    }

    // Create new room when no waiting opponents are available
    return await this.createRoom();
  }

  async createRoom(): Promise<string> {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const roomId = generateId(8);
    const roomRef = ref(this.database, `${FIREBASE_PATHS.ROOMS}/${roomId}`);

    const roomData: RoomData = {
      id: roomId,
      host: userId,
      status: 'waiting',
      createdAt: Date.now(),
    };

    await set(roomRef, roomData);

    // Set up auto-cleanup on disconnect
    const hostRef = ref(this.database, `${FIREBASE_PATHS.ROOMS}/${roomId}/host`);
    onDisconnect(hostRef).remove();

    this.currentRoomId = roomId;
    return roomId;
  }

  async joinRoom(roomId: string): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const roomRef = ref(this.database, `${FIREBASE_PATHS.ROOMS}/${roomId}`);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
      throw new Error('Room not found');
    }

    const roomData = snapshot.val() as RoomData;

    if (roomData.status !== 'waiting') {
      throw new Error('Room is not available');
    }

    if (roomData.host === userId) {
      throw new Error('Cannot join your own room');
    }

    // Update room with guest
    await update(roomRef, {
      guest: userId,
      status: 'playing',
    });

    // Set up auto-cleanup on disconnect
    const guestRef = ref(this.database, `${FIREBASE_PATHS.ROOMS}/${roomId}/guest`);
    onDisconnect(guestRef).remove();

    this.currentRoomId = roomId;
  }

  async createPrivateRoom(): Promise<string> {
    const roomId = await this.createRoom();
    // Mark as private (not shown in matchmaking)
    const roomRef = ref(this.database, `${FIREBASE_PATHS.ROOMS}/${roomId}`);
    await update(roomRef, { isPrivate: true });
    return roomId;
  }

  async joinPrivateRoom(roomId: string): Promise<void> {
    await this.joinRoom(roomId);
  }

  onRoomUpdate(callback: (room: RoomData | null) => void): void {
    if (!this.currentRoomId) return;

    const roomRef = ref(this.database, `${FIREBASE_PATHS.ROOMS}/${this.currentRoomId}`);

    const unsubscribe = onValue(roomRef, (snapshot: DataSnapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val() as RoomData);
      } else {
        callback(null);
      }
    });

    this.unsubscribers.push(unsubscribe);
  }

  onOpponentJoin(callback: (opponentId: string) => void): void {
    if (!this.currentRoomId) return;

    const guestRef = ref(this.database, `${FIREBASE_PATHS.ROOMS}/${this.currentRoomId}/guest`);

    const unsubscribe = onValue(guestRef, (snapshot: DataSnapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val() as string);
      }
    });

    this.unsubscribers.push(unsubscribe);
  }

  async leaveRoom(): Promise<void> {
    if (!this.currentRoomId) return;

    const userId = getCurrentUserId();
    const roomRef = ref(this.database, `${FIREBASE_PATHS.ROOMS}/${this.currentRoomId}`);
    const snapshot = await get(roomRef);

    if (snapshot.exists()) {
      const roomData = snapshot.val() as RoomData;

      if (roomData.host === userId) {
        // Host leaves - delete room
        await remove(roomRef);
      } else if (roomData.guest === userId) {
        // Guest leaves - update room
        await update(roomRef, {
          guest: null,
          status: 'waiting',
        });
      }
    }

    this.cleanup();
  }

  cleanup(): void {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
    this.currentRoomId = null;
  }

  getCurrentRoomId(): string | null {
    return this.currentRoomId;
  }

  private async findWaitingRoomId(roomsRef: DatabaseReference): Promise<string | null> {
    const waitingQuery = query(
      roomsRef,
      orderByChild('status'),
      equalTo('waiting'),
      limitToFirst(1)
    );

    try {
      const snapshot = await get(waitingQuery);
      if (!snapshot.exists()) return null;
      const rooms = snapshot.val() as Record<string, RoomData> | null;
      return this.findWaitingRoomIdInData(rooms);
    } catch (error) {
      if (this.isMissingIndexError(error)) {
        console.warn(
          '[Matchmaking] Missing Realtime Database index on rooms.status – falling back to client-side filtering.'
        );
        const fallbackSnapshot = await get(roomsRef);
        if (!fallbackSnapshot.exists()) return null;
        const rooms = fallbackSnapshot.val() as Record<string, RoomData> | null;
        return this.findWaitingRoomIdInData(rooms);
      }

      throw error;
    }
  }

  private findWaitingRoomIdInData(
    rooms: Record<string, RoomData> | null | undefined
  ): string | null {
    if (!rooms) return null;
    for (const [roomId, room] of Object.entries(rooms)) {
      if (room?.status === 'waiting') {
        return roomId;
      }
    }
    return null;
  }

  private isMissingIndexError(error: unknown): boolean {
    return (
      error instanceof Error &&
      /index not defined/i.test(error.message ?? '') &&
      error.message.includes('/rooms')
    );
  }
}
