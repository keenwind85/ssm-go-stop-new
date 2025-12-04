import { Container, Sprite, Texture } from 'pixi.js';
import { Card } from './Card';
import { CARD_WIDTH, CARD_HEIGHT } from '@utils/constants';
import type { CardData } from '@utils/types';

export class Field extends Container {
  private cards: Map<number, Card[]> = new Map();
  private background: Sprite;
  private cardContainer: Container;
  private static readonly CARDS_PER_ROW = 8;
  private static readonly CARD_SPACING = 8;
  // Field height constraint - fit within field zone
  private static readonly MAX_ROWS = 2;
  private static readonly ROW_HEIGHT = CARD_HEIGHT + 20;

  // 배경 이미지 크기 (바닥패 영역에 맞게 설정)
  private static readonly BG_WIDTH = Field.CARDS_PER_ROW * (CARD_WIDTH + Field.CARD_SPACING) + 40;
  private static readonly BG_HEIGHT = Field.MAX_ROWS * Field.ROW_HEIGHT + 40;

  constructor() {
    super();

    // 배경 이미지 추가
    this.background = new Sprite();
    try {
      this.background.texture = Texture.from('field_bg');
    } catch {
      console.warn('Field background texture not found');
    }
    this.background.anchor.set(0.5);
    this.background.width = Field.BG_WIDTH;
    this.background.height = Field.BG_HEIGHT;
    this.background.alpha = 0.8; // 약간 투명하게
    this.addChild(this.background);

    // 카드들을 담을 컨테이너 (배경 위에 표시)
    this.cardContainer = new Container();
    this.addChild(this.cardContainer);

    // Initialize month groups (1-12)
    for (let month = 1; month <= 12; month++) {
      this.cards.set(month, []);
    }
  }

  addCard(card: Card): void {
    const month = card.getMonth();
    const monthCards = this.cards.get(month) || [];
    monthCards.push(card);
    this.cards.set(month, monthCards);

    this.cardContainer.addChild(card);
    this.arrangeCards();

    // Setup card selection
    card.on('selected', () => {
      this.emit('cardSelected', card);
    });
  }

  addCards(cards: Card[]): void {
    cards.forEach(card => this.addCard(card));
  }

  removeCard(card: Card): void {
    const month = card.getMonth();
    const monthCards = this.cards.get(month) || [];
    const index = monthCards.indexOf(card);

    if (index !== -1) {
      monthCards.splice(index, 1);
      this.cards.set(month, monthCards);
      this.cardContainer.removeChild(card);
      this.arrangeCards();
    }
  }

  getMatchingCards(month: number): Card[] {
    return this.cards.get(month) || [];
  }

  getCardById(cardId: string): Card | undefined {
    for (const monthCards of this.cards.values()) {
      const found = monthCards.find(card => card.getId() === cardId);
      if (found) return found;
    }
    return undefined;
  }

  hasMatch(month: number): boolean {
    const monthCards = this.cards.get(month) || [];
    return monthCards.length > 0;
  }

  // 매칭되는 카드들 하이라이트 표시
  highlightMatchingCards(month: number): void {
    // Clear all highlights first
    this.clearAllHighlights();

    // Highlight matching cards
    const matchingCards = this.cards.get(month) || [];
    matchingCards.forEach(card => {
      card.setMatchHighlight(true);
    });
  }

  // 모든 하이라이트 제거
  clearAllHighlights(): void {
    this.cards.forEach(monthCards => {
      monthCards.forEach(card => {
        card.setMatchHighlight(false);
      });
    });
  }

  private arrangeCards(): void {
    // Collect all cards with positions
    const allCards: { card: Card; month: number }[] = [];

    for (let month = 1; month <= 12; month++) {
      const monthCards = this.cards.get(month) || [];
      monthCards.forEach(card => {
        allCards.push({ card, month });
      });
    }

    if (allCards.length === 0) return;

    // Calculate number of rows needed
    const numRows = Math.min(
      Math.ceil(allCards.length / Field.CARDS_PER_ROW),
      Field.MAX_ROWS
    );

    // Center rows vertically within field zone
    const totalHeight = numRows * Field.ROW_HEIGHT - 20;
    const startY = -totalHeight / 2 + CARD_HEIGHT / 2;

    // Arrange in grid
    const totalWidth = Field.CARDS_PER_ROW * (CARD_WIDTH + Field.CARD_SPACING) - Field.CARD_SPACING;
    const startX = -totalWidth / 2 + CARD_WIDTH / 2;

    allCards.forEach((item, index) => {
      const row = Math.floor(index / Field.CARDS_PER_ROW);
      const col = index % Field.CARDS_PER_ROW;

      const x = startX + col * (CARD_WIDTH + Field.CARD_SPACING);
      const y = startY + row * Field.ROW_HEIGHT;

      item.card.moveTo(x, y);
    });
  }

  getAllCards(): Card[] {
    const allCards: Card[] = [];
    this.cards.forEach(monthCards => {
      allCards.push(...monthCards);
    });
    return allCards;
  }

  getCardData(): CardData[] {
    return this.getAllCards().map(card => card.cardData);
  }

  getCardCount(): number {
    let count = 0;
    this.cards.forEach(monthCards => {
      count += monthCards.length;
    });
    return count;
  }

  clear(): void {
    this.cards.forEach(monthCards => {
      monthCards.forEach(card => {
        this.cardContainer.removeChild(card);
      });
    });

    for (let month = 1; month <= 12; month++) {
      this.cards.set(month, []);
    }
  }

  setCardsFromData(cardData: CardData[]): void {
    this.clear();
    cardData.forEach(data => {
      const card = new Card(data);
      this.addCard(card);
    });
  }
}
