import { Container } from 'pixi.js';
import { Card } from './Card';
import { CARD_WIDTH, CARD_HEIGHT } from '@utils/constants';

export class Field extends Container {
  private cards: Map<number, Card[]> = new Map();
  private static readonly CARDS_PER_ROW = 8;
  private static readonly CARD_SPACING = 8;
  // Field height constraint - fit within field zone
  private static readonly MAX_ROWS = 2;
  private static readonly ROW_HEIGHT = CARD_HEIGHT + 20;

  constructor() {
    super();

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

    this.addChild(card);
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
      this.removeChild(card);
      this.arrangeCards();
    }
  }

  getMatchingCards(month: number): Card[] {
    return this.cards.get(month) || [];
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
        this.removeChild(card);
      });
    });

    for (let month = 1; month <= 12; month++) {
      this.cards.set(month, []);
    }
  }
}
