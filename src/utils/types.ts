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
  animal: number;
  ribbon: number;
  pi: number;
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
  };
  total: number;
}

// Firebase
export interface RoomData {
  id: string;
  host: string;
  guest?: string;
  status: 'waiting' | 'playing' | 'finished';
  createdAt: number;
  gameState?: GameState;
}

export interface UserData {
  id: string;
  name: string;
  wins: number;
  losses: number;
  rating: number;
  createdAt: number;
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
