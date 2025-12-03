// Card types
export type CardType = 'kwang' | 'animal' | 'ribbon' | 'pi';

export interface CardData {
  id: string;
  month: number;
  index: number;
  type: CardType;
}

// Player types
export interface PlayerState {
  id: string;
  name: string;
  hand: CardData[];
  collected: {
    kwang: CardData[];
    animal: CardData[];
    ribbon: CardData[];
    pi: CardData[];
  };
  score: number;
  goCount: number;
}

export type RoomStatus = 'waiting' | 'playing' | 'finished' | 'waiting_consent';

export interface RoomJoinRequest {
  playerId: string;
  playerName: string;
  requestedAt: number;
}

// Game state
export type GamePhase =
  | 'waiting'
  | 'dealing'
  | 'playerTurn'
  | 'opponentTurn'
  | 'selecting'           // 손패 카드로 바닥패 2장 매칭 시 선택
  | 'deckSelecting'       // 뒷패 카드로 바닥패 2장 매칭 시 선택
  | 'resolving'
  | 'goStop'              // 고/스톱 결정
  | 'checking'
  | 'gameOver';

export interface GameState {
  phase: GamePhase;
  currentTurn: 'player' | 'opponent';
  turnNumber: number;
  field: CardData[];
  deck: CardData[];
  player: PlayerState;
  opponent: PlayerState;
  lastAction?: GameAction;
  selectionContext?: {
    type: 'deck';
    options: CardData[];
    drawnCard: CardData;
    requiredFor: 'player' | 'opponent';
  };
  goStopContext?: {
    player: 'player' | 'opponent';
    score: number;
    goCount: number;
  };
}

// Game actions
export type GameActionType =
  | 'PLAY_CARD'
  | 'SELECT_FIELD_CARD'
  | 'DRAW_CARD'
  | 'COLLECT_CARDS'
  | 'DECLARE_GO'
  | 'DECLARE_STOP'
  | 'SHAKE'
  | 'BOMB';

export interface GameAction {
  type: GameActionType;
  playerId: string;
  cardId?: string;
  targetCardId?: string;
  targetMonth?: number;
  timestamp: number;
}

// Scoring
export interface ScoreBreakdown {
  kwang: number;
  kwangCount: number; // 광 카드 개수 (광박 계산용)
  animal: number;
  ribbon: number;
  pi: number;
  piCount: number; // 피 점수 (쌍피는 2점, 피박 계산용)
  special: {
    godori: boolean;
    hongdan: boolean;
    cheongdan: boolean;
    chodan: boolean;
  };
  multipliers: {
    go: number;
    shake: number;
    ppuk: number;
    piBak: number;
    gwangBak: number;
  };
  total: number;
}

// Firebase
export interface RoomData {
  id: string;
  name?: string;
  host: string;
  guest?: string;
  hostName?: string;
  guestName?: string;
  status: RoomStatus;
  createdAt: number;
  joinRequest?: RoomJoinRequest | null;
  isPrivate?: boolean;
  lastActivityAt?: number;
  gameState?: GameState;
  // 연속 게임 관련
  roundNumber?: number;                    // 현재 라운드 번호
  continueConsent?: ContinueGameConsent;   // 연속 게임 동의 상태
  lastGameResult?: {                       // 마지막 게임 결과
    winnerId: string;
    winnerScore: number;
    loserScore: number;
    coinTransfer: number;
  };
  hostCoins?: number;                      // 호스트 현재 코인
  guestCoins?: number;                     // 게스트 현재 코인
}

export interface UserData {
  id: string;
  name: string;
  wins: number;
  losses: number;
  rating: number;
  createdAt: number;
  coins: number;
  lastAttendance?: number;  // 마지막 출석 체크 날짜 (timestamp)
  lastDonation?: number;    // 마지막 기부 날짜 (timestamp)
}

// 코인 관련 타입
export interface CoinTransaction {
  id: string;
  userId: string;
  amount: number;
  type: CoinTransactionType;
  relatedUserId?: string;   // 기부 대상 또는 게임 상대방
  relatedGameId?: string;   // 관련 게임 ID
  timestamp: number;
  description: string;
}

export type CoinTransactionType =
  | 'signup_bonus'      // 가입 보너스 (100코인)
  | 'attendance'        // 출석 체크 (10코인)
  | 'game_win'          // 게임 승리로 획득
  | 'game_lose'         // 게임 패배로 소진
  | 'donation_sent'     // 기부 보낸 것 (-10코인)
  | 'donation_received'; // 기부 받은 것 (+10코인)

// 코인 랭킹 타입
export interface CoinRanking {
  rank: number;
  userId: string;
  name: string;
  coins: number;
}

// 멀티플레이어 게임 연속 플레이 동의
export interface ContinueGameConsent {
  hostConsent?: boolean;
  guestConsent?: boolean;
  roundNumber: number;
}

// Events
export interface GameEvents {
  cardSelected: CardData;
  turnStart: 'player' | 'opponent';
  turnEnd: 'player' | 'opponent';
  scoreUpdate: { player: number; opponent: number };
  goDecision: { declared: boolean; count: number };
  gameEnd: { winner: 'player' | 'opponent'; scores: ScoreBreakdown };
}

// Animation
export interface AnimationConfig {
  duration: number;
  ease: string;
  delay?: number;
}

// Match result
export interface MatchResult {
  winner: 'player' | 'opponent';
  playerScore: ScoreBreakdown;
  opponentScore: ScoreBreakdown;
  duration: number;
  turnCount: number;
}
