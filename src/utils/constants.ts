// Game dimensions (landscape mode)
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

// Card dimensions
export const CARD_WIDTH = 100;
export const CARD_HEIGHT = 150;
export const CARD_SCALE = 1;

// Collected card dimensions (smaller for display)
export const COLLECTED_CARD_WIDTH = 60;
export const COLLECTED_CARD_HEIGHT = 90;

// Animation durations (in seconds)
export const ANIMATION_DURATION = {
  CARD_DEAL: 0.3,
  CARD_FLIP: 0.2,
  CARD_MOVE: 0.25,
  CARD_COLLECT: 0.4,
  SCORE_POPUP: 0.5,
} as const;

// Layout zones (landscape)
export const LAYOUT = {
  // Left game area (hands + field)
  GAME_AREA_WIDTH: 880,
  GAME_AREA_CENTER_X: 440,

  // Vertical zones
  OPPONENT_HAND_Y: 80,
  FIELD_TOP_Y: 180,
  FIELD_BOTTOM_Y: 540,
  PLAYER_HAND_Y: 640,

  // Right panel (deck + collected cards)
  RIGHT_PANEL_X: 1080,
} as const;

// Game positions (landscape layout)
export const POSITIONS = {
  // Left area - Game play (centered in game area)
  FIELD: { x: LAYOUT.GAME_AREA_CENTER_X, y: (LAYOUT.FIELD_TOP_Y + LAYOUT.FIELD_BOTTOM_Y) / 2 },
  PLAYER_HAND: { x: LAYOUT.GAME_AREA_CENTER_X, y: LAYOUT.PLAYER_HAND_Y },
  OPPONENT_HAND: { x: LAYOUT.GAME_AREA_CENTER_X, y: LAYOUT.OPPONENT_HAND_Y },

  // Right area - Deck and collected cards
  DECK: { x: LAYOUT.RIGHT_PANEL_X, y: GAME_HEIGHT / 2 },
  PLAYER_COLLECTED: { x: LAYOUT.RIGHT_PANEL_X, y: GAME_HEIGHT - 150 },
  OPPONENT_COLLECTED: { x: LAYOUT.RIGHT_PANEL_X, y: 150 },
} as const;

// Card types
export const CARD_TYPES = {
  KWANG: 'kwang',      // 광
  ANIMAL: 'animal',    // 열끗 (동물)
  RIBBON: 'ribbon',    // 띠
  PI: 'pi',            // 피
} as const;

// Months (1-12)
export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

// Scoring rules
export const SCORING = {
  // 광 점수
  KWANG: {
    FIVE_KWANG: 15,        // 오광
    FOUR_KWANG: 4,         // 사광 (비광 제외)
    FOUR_KWANG_WITH_RAIN: 3, // 사광 (비광 포함)
    THREE_KWANG: 3,        // 삼광 (비광 제외)
    THREE_KWANG_WITH_RAIN: 2, // 삼광 (비광 포함)
  },
  // 동물 점수
  ANIMAL: {
    BASE: 1,               // 5장부터 1점
    GODORI: 5,            // 고도리 (홍단)
  },
  // 띠 점수
  RIBBON: {
    BASE: 1,               // 5장부터 1점
    HONGDAN: 3,           // 홍단 (1, 2, 3월 띠)
    CHEONGDAN: 3,         // 청단 (6, 9, 10월 띠)
    CHODAN: 3,            // 초단 (4, 5, 7월 띠)
  },
  // 피 점수
  PI: {
    BASE: 1,               // 10장부터 1점
    EXTRA_PER_CARD: 1,    // 10장 이후 장당 1점
  },
  // 특수 점수
  SPECIAL: {
    GO_MULTIPLIER: 2,     // 고 배수
    SHAKE: 2,             // 흔들기
    PPUK: 2,              // 뻑
    GWANG_BAK: 3,         // 광박
    MUNG_BAK: 2,          // 멍박
    PI_BAK: 2,            // 피박
  },
} as const;

// Firebase paths
export const FIREBASE_PATHS = {
  ROOMS: 'rooms',
  USERS: 'users',
  MATCHES: 'matches',
  LEADERBOARD: 'leaderboard',
} as const;

// Colors
export const COLORS = {
  BACKGROUND: 0x1a1a2e,
  PRIMARY: 0xe94560,
  SECONDARY: 0x16213e,
  TEXT: 0xffffff,
  TEXT_MUTED: 0x8b8b8b,
  SUCCESS: 0x4ade80,
  WARNING: 0xfbbf24,
  ERROR: 0xef4444,
  CARD_HIGHLIGHT: 0xffd700,
} as const;

// Z-index layers
export const LAYERS = {
  BACKGROUND: 0,
  FIELD: 10,
  CARDS: 20,
  HAND: 30,
  ANIMATION: 40,
  UI: 50,
  MODAL: 60,
  TOOLTIP: 70,
} as const;
