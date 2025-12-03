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
import { getCurrentUser, getCurrentUserId } from './auth';
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

  watchAvailableRooms(callback: (rooms: RoomData[]) => void): () => void {
    const roomsRef = ref(this.database, FIREBASE_PATHS.ROOMS);
    const unsubscribe = onValue(roomsRef, (snapshot: DataSnapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }

      const roomsRecord = snapshot.val() as Record<string, RoomData> | null;
      const rooms = roomsRecord ? Object.values(roomsRecord).filter(Boolean) : [];
      const activeRooms = rooms
        .filter(room => !room?.isPrivate && (room.status === 'waiting' || room.status === 'challenge_pending'))
        .sort((a, b) => b.createdAt - a.createdAt);

      callback(activeRooms);
    });

    this.unsubscribers.push(unsubscribe);
    return unsubscribe;
  }

  async createRoom(roomName?: string): Promise<string> {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const roomId = generateId(8);
    const roomRef = ref(this.database, `${FIREBASE_PATHS.ROOMS}/${roomId}`);
    const displayName = this.getDisplayName();
    const trimmedName = roomName?.trim();

    const roomData: RoomData = {
      id: roomId,
      name: trimmedName && trimmedName.length > 0 ? trimmedName : `${displayName}의 게임방`,
      host: userId,
      hostName: displayName,
      status: 'waiting',
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      joinRequest: null,
    };

    await set(roomRef, roomData);

    // Set up auto-cleanup on disconnect
    const hostRef = ref(this.database, `${FIREBASE_PATHS.ROOMS}/${roomId}/host`);
    onDisconnect(hostRef).remove();

    this.currentRoomId = roomId;
    return roomId;
  }

  async createNamedRoom(roomName: string): Promise<string> {
    return this.createRoom(roomName);
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
      guestName: this.getDisplayName(),
      status: 'playing',
      joinRequest: null,
      lastActivityAt: Date.now(),
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

  async requestJoinRoom(roomId: string): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const roomRef = ref(this.database, `${FIREBASE_PATHS.ROOMS}/${roomId}`);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
      throw new Error('게임방을 찾을 수 없습니다.');
    }

    const roomData = snapshot.val() as RoomData;

    if (roomData.host === userId) {
      throw new Error('자신의 게임방에는 참여할 수 없습니다.');
    }

    if (roomData.status !== 'waiting' || roomData.joinRequest) {
      throw new Error('다른 도전자가 이미 대기 중입니다.');
    }

    await update(roomRef, {
      joinRequest: {
        playerId: userId,
        playerName: this.getDisplayName(),
        requestedAt: Date.now(),
      },
      status: 'challenge_pending',
      lastActivityAt: Date.now(),
    });
  }

  async cancelJoinRequest(roomId: string): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const roomRef = ref(this.database, `${FIREBASE_PATHS.ROOMS}/${roomId}`);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
      return;
    }

    const roomData = snapshot.val() as RoomData;
    if (roomData.joinRequest?.playerId !== userId) {
      return;
    }

    await update(roomRef, {
      joinRequest: null,
      status: 'waiting',
      lastActivityAt: Date.now(),
    });
  }

  watchRoom(roomId: string, callback: (room: RoomData | null) => void): () => void {
    const roomRef = ref(this.database, `${FIREBASE_PATHS.ROOMS}/${roomId}`);
    const unsubscribe = onValue(roomRef, (snapshot: DataSnapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      callback(snapshot.val() as RoomData);
    });

    this.unsubscribers.push(unsubscribe);
    return unsubscribe;
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
          guestName: null,
          status: 'waiting',
          joinRequest: null,
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

  private getDisplayName(): string {
    return getCurrentUser()?.displayName ?? '플레이어';
  }
}
