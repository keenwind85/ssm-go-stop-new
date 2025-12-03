/**
 * 코인 서비스 - 코인 관련 모든 Firebase 작업 처리
 */
import { ref, get, set, update, query, orderByChild, limitToLast, onValue, push } from 'firebase/database';
import { getRealtimeDatabase } from './config';
import { getCurrentUserId } from './auth';
import { FIREBASE_PATHS, COIN_CONSTANTS } from '@utils/constants';
import type { UserData, CoinTransaction, CoinTransactionType, CoinRanking } from '@utils/types';

/**
 * 오늘 날짜의 시작 시간 (00:00:00) 을 반환
 */
function getTodayStartTimestamp(): number {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return todayStart.getTime();
}

/**
 * 주어진 타임스탬프가 오늘인지 확인
 */
function isToday(timestamp: number): boolean {
  const todayStart = getTodayStartTimestamp();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000;
  return timestamp >= todayStart && timestamp < todayEnd;
}

/**
 * 사용자의 코인 잔액 조회
 */
export async function getUserCoins(userId: string): Promise<number> {
  const database = getRealtimeDatabase();
  const userRef = ref(database, `${FIREBASE_PATHS.USERS}/${userId}/coins`);
  const snapshot = await get(userRef);
  return snapshot.exists() ? (snapshot.val() as number) : 0;
}

/**
 * 현재 사용자의 코인 잔액 조회
 */
export async function getCurrentUserCoins(): Promise<number> {
  const userId = getCurrentUserId();
  if (!userId) return 0;
  return getUserCoins(userId);
}

/**
 * 코인 거래 기록 생성
 */
async function recordTransaction(
  userId: string,
  amount: number,
  type: CoinTransactionType,
  description: string,
  relatedUserId?: string,
  relatedGameId?: string
): Promise<void> {
  const database = getRealtimeDatabase();
  const transactionsRef = ref(database, FIREBASE_PATHS.COIN_TRANSACTIONS);
  const newTransactionRef = push(transactionsRef);

  const transaction: CoinTransaction = {
    id: newTransactionRef.key!,
    userId,
    amount,
    type,
    timestamp: Date.now(),
    description,
    ...(relatedUserId && { relatedUserId }),
    ...(relatedGameId && { relatedGameId }),
  };

  await set(newTransactionRef, transaction);
}

/**
 * 사용자의 코인 업데이트 (트랜잭션 기록 포함)
 */
export async function updateUserCoins(
  userId: string,
  amount: number,
  type: CoinTransactionType,
  description: string,
  relatedUserId?: string,
  relatedGameId?: string
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const database = getRealtimeDatabase();
  const userRef = ref(database, `${FIREBASE_PATHS.USERS}/${userId}`);

  try {
    const snapshot = await get(userRef);
    if (!snapshot.exists()) {
      return { success: false, newBalance: 0, error: '사용자를 찾을 수 없습니다.' };
    }

    const userData = snapshot.val() as UserData;
    const currentCoins = userData.coins ?? 0;
    let newBalance = currentCoins + amount;

    // 마이너스 코인 방지
    if (newBalance < 0) {
      newBalance = 0;
    }

    await update(userRef, { coins: newBalance });
    await recordTransaction(userId, amount, type, description, relatedUserId, relatedGameId);

    return { success: true, newBalance };
  } catch (error) {
    console.error('Failed to update user coins:', error);
    return { success: false, newBalance: 0, error: '코인 업데이트에 실패했습니다.' };
  }
}

/**
 * 출석 체크 가능 여부 확인
 */
export async function canClaimAttendance(userId: string): Promise<boolean> {
  const database = getRealtimeDatabase();
  const userRef = ref(database, `${FIREBASE_PATHS.USERS}/${userId}/lastAttendance`);
  const snapshot = await get(userRef);

  if (!snapshot.exists()) return true;

  const lastAttendance = snapshot.val() as number;
  return !isToday(lastAttendance);
}

/**
 * 출석 체크하고 코인 획득
 */
export async function claimAttendanceReward(): Promise<{ success: boolean; coins: number; error?: string }> {
  const userId = getCurrentUserId();
  if (!userId) {
    return { success: false, coins: 0, error: '로그인이 필요합니다.' };
  }

  const canClaim = await canClaimAttendance(userId);
  if (!canClaim) {
    return { success: false, coins: 0, error: '오늘은 이미 출석 체크를 완료했습니다.' };
  }

  const database = getRealtimeDatabase();
  const userRef = ref(database, `${FIREBASE_PATHS.USERS}/${userId}`);

  try {
    const snapshot = await get(userRef);
    if (!snapshot.exists()) {
      return { success: false, coins: 0, error: '사용자를 찾을 수 없습니다.' };
    }

    const userData = snapshot.val() as UserData;
    const currentCoins = userData.coins ?? 0;
    const newBalance = currentCoins + COIN_CONSTANTS.ATTENDANCE_REWARD;

    await update(userRef, {
      coins: newBalance,
      lastAttendance: Date.now(),
    });

    await recordTransaction(
      userId,
      COIN_CONSTANTS.ATTENDANCE_REWARD,
      'attendance',
      '출석 체크 보상'
    );

    return { success: true, coins: newBalance };
  } catch (error) {
    console.error('Failed to claim attendance reward:', error);
    return { success: false, coins: 0, error: '출석 체크에 실패했습니다.' };
  }
}

/**
 * 기부 가능 여부 확인
 */
export async function canDonateToday(userId: string): Promise<boolean> {
  const database = getRealtimeDatabase();
  const userRef = ref(database, `${FIREBASE_PATHS.USERS}/${userId}/lastDonation`);
  const snapshot = await get(userRef);

  if (!snapshot.exists()) return true;

  const lastDonation = snapshot.val() as number;
  return !isToday(lastDonation);
}

/**
 * 다른 사용자에게 코인 기부
 */
export async function donateCoins(
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  const senderId = getCurrentUserId();
  if (!senderId) {
    return { success: false, error: '로그인이 필요합니다.' };
  }

  if (senderId === targetUserId) {
    return { success: false, error: '자신에게는 기부할 수 없습니다.' };
  }

  const canDonate = await canDonateToday(senderId);
  if (!canDonate) {
    return { success: false, error: '오늘은 이미 기부를 완료했습니다.' };
  }

  const senderCoins = await getUserCoins(senderId);
  if (senderCoins < COIN_CONSTANTS.DONATION_AMOUNT) {
    return { success: false, error: '코인이 부족합니다.' };
  }

  const database = getRealtimeDatabase();

  try {
    // 보내는 사람 코인 차감
    const senderRef = ref(database, `${FIREBASE_PATHS.USERS}/${senderId}`);
    const senderSnapshot = await get(senderRef);
    const senderData = senderSnapshot.val() as UserData;

    await update(senderRef, {
      coins: senderData.coins - COIN_CONSTANTS.DONATION_AMOUNT,
      lastDonation: Date.now(),
    });

    // 받는 사람 코인 증가
    const receiverRef = ref(database, `${FIREBASE_PATHS.USERS}/${targetUserId}`);
    const receiverSnapshot = await get(receiverRef);
    if (!receiverSnapshot.exists()) {
      // 롤백
      await update(senderRef, {
        coins: senderData.coins,
        lastDonation: senderData.lastDonation ?? null,
      });
      return { success: false, error: '대상 사용자를 찾을 수 없습니다.' };
    }

    const receiverData = receiverSnapshot.val() as UserData;
    await update(receiverRef, {
      coins: (receiverData.coins ?? 0) + COIN_CONSTANTS.DONATION_AMOUNT,
    });

    // 거래 기록
    await recordTransaction(
      senderId,
      -COIN_CONSTANTS.DONATION_AMOUNT,
      'donation_sent',
      `${receiverData.name}님에게 코인 기부`,
      targetUserId
    );

    await recordTransaction(
      targetUserId,
      COIN_CONSTANTS.DONATION_AMOUNT,
      'donation_received',
      `${senderData.name}님으로부터 코인 기부 받음`,
      senderId
    );

    return { success: true };
  } catch (error) {
    console.error('Failed to donate coins:', error);
    return { success: false, error: '기부에 실패했습니다.' };
  }
}

/**
 * 게임 참여 가능 여부 확인 (최소 코인 체크)
 */
export async function canJoinGame(userId: string): Promise<{ canJoin: boolean; currentCoins: number }> {
  const coins = await getUserCoins(userId);
  return {
    canJoin: coins >= COIN_CONSTANTS.MIN_COINS_FOR_GAME,
    currentCoins: coins,
  };
}

/**
 * 게임 결과에 따른 코인 정산
 * @param winnerId 승자 ID
 * @param loserId 패자 ID
 * @param winnerScore 승자 점수 (ScoreBreakdown.total)
 * @param roomId 게임방 ID
 */
export async function settleGameCoins(
  winnerId: string,
  loserId: string,
  winnerScore: number,
  roomId: string
): Promise<{
  success: boolean;
  winnerCoins: number;
  loserCoins: number;
  transferAmount: number;
  loserBankrupt: boolean;
}> {
  try {
    // 승자 점수를 코인으로 변환 (1점 = 1코인)
    const transferAmount = winnerScore * COIN_CONSTANTS.POINTS_TO_COINS_RATIO;

    // 패자의 현재 코인 확인
    const loserCurrentCoins = await getUserCoins(loserId);

    // 실제 전송할 코인 (패자의 코인이 부족하면 있는 만큼만)
    const actualTransfer = Math.min(transferAmount, loserCurrentCoins);
    const loserBankrupt = loserCurrentCoins <= transferAmount;

    // 패자 코인 차감
    await updateUserCoins(
      loserId,
      -actualTransfer,
      'game_lose',
      `게임 패배 (${actualTransfer}코인 차감)`,
      winnerId,
      roomId
    );

    // 승자 코인 증가
    const winnerResult = await updateUserCoins(
      winnerId,
      actualTransfer,
      'game_win',
      `게임 승리 (${actualTransfer}코인 획득)`,
      loserId,
      roomId
    );

    const loserCoins = await getUserCoins(loserId);

    return {
      success: true,
      winnerCoins: winnerResult.newBalance,
      loserCoins,
      transferAmount: actualTransfer,
      loserBankrupt,
    };
  } catch (error) {
    console.error('Failed to settle game coins:', error);
    return {
      success: false,
      winnerCoins: 0,
      loserCoins: 0,
      transferAmount: 0,
      loserBankrupt: false,
    };
  }
}

/**
 * 코인 랭킹 조회 (상위 100명)
 */
export async function getCoinRanking(): Promise<CoinRanking[]> {
  const database = getRealtimeDatabase();
  const usersRef = ref(database, FIREBASE_PATHS.USERS);

  // orderByChild와 limitToLast를 사용하여 상위 100명 조회
  const rankingQuery = query(
    usersRef,
    orderByChild('coins'),
    limitToLast(COIN_CONSTANTS.RANKING_LIMIT)
  );

  const snapshot = await get(rankingQuery);

  if (!snapshot.exists()) {
    return [];
  }

  const users: CoinRanking[] = [];
  snapshot.forEach((childSnapshot) => {
    const userData = childSnapshot.val() as UserData;
    users.push({
      rank: 0, // 나중에 설정
      userId: userData.id,
      name: userData.name,
      coins: userData.coins ?? 0,
    });
  });

  // 코인 내림차순 정렬 후 순위 부여
  users.sort((a, b) => b.coins - a.coins);
  users.forEach((user, index) => {
    user.rank = index + 1;
  });

  return users;
}

/**
 * 모든 사용자 목록 조회 (기부용)
 */
export async function getAllUsers(): Promise<Pick<UserData, 'id' | 'name' | 'coins'>[]> {
  const database = getRealtimeDatabase();
  const usersRef = ref(database, FIREBASE_PATHS.USERS);
  const snapshot = await get(usersRef);

  if (!snapshot.exists()) {
    return [];
  }

  const users: Pick<UserData, 'id' | 'name' | 'coins'>[] = [];
  const currentUserId = getCurrentUserId();

  snapshot.forEach((childSnapshot) => {
    const userData = childSnapshot.val() as UserData;
    // 자기 자신 제외
    if (userData.id !== currentUserId) {
      users.push({
        id: userData.id,
        name: userData.name,
        coins: userData.coins ?? 0,
      });
    }
  });

  // 이름순 정렬
  users.sort((a, b) => a.name.localeCompare(b.name));

  return users;
}

/**
 * 사용자 코인 변경 실시간 감지
 */
export function watchUserCoins(userId: string, callback: (coins: number) => void): () => void {
  const database = getRealtimeDatabase();
  const coinsRef = ref(database, `${FIREBASE_PATHS.USERS}/${userId}/coins`);

  const unsubscribe = onValue(coinsRef, (snapshot) => {
    const coins = snapshot.exists() ? (snapshot.val() as number) : 0;
    callback(coins);
  });

  return unsubscribe;
}
