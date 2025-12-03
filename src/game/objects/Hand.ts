import { Container, Texture } from 'pixi.js';
import { Card } from './Card';
import { CARD_WIDTH, LAYOUT } from '@utils/constants';
import type { CardData } from '@utils/types';

export class Hand extends Container {
  private cards: Card[] = [];
  private isPlayer: boolean;
  private selectedCard: Card | null = null;
  // Hand cards should fit within the game area with padding
  private static readonly MAX_VISIBLE_WIDTH = LAYOUT.GAME_AREA_WIDTH - 80;

  constructor(isPlayer: boolean) {
    super();
    this.isPlayer = isPlayer;
  }

  addCard(card: Card): void {
    this.cards.push(card);
    this.addChild(card);

    // Show card back for opponent's cards
    if (!this.isPlayer) {
      try {
        card.texture = Texture.from('card_back');
      } catch {
        console.warn('Card back texture not found');
      }
    }

    // Setup selection and hover for player's cards
    if (this.isPlayer) {
      card.on('selected', () => this.onCardSelected(card));
      card.on('pointerover', () => this.onCardHover(card));
      card.on('pointerout', () => this.onCardHoverEnd());
    }

    this.arrangeCards();
  }

  private onCardHover(card: Card): void {
    this.emit('cardHover', card.getMonth());
  }

  private onCardHoverEnd(): void {
    this.emit('cardHoverEnd');
  }

  addCards(cards: Card[]): void {
    cards.forEach(card => this.addCard(card));
  }

  removeCard(card: Card): Card | undefined {
    const index = this.cards.indexOf(card);
    if (index !== -1) {
      this.cards.splice(index, 1);
      this.removeChild(card);
      this.arrangeCards();

      if (this.selectedCard === card) {
        this.selectedCard = null;
      }

      return card;
    }
    return undefined;
  }

  private onCardSelected(card: Card): void {
    // Deselect previous card
    if (this.selectedCard && this.selectedCard !== card) {
      this.selectedCard.setSelected(false);
    }

    // Toggle selection
    if (this.selectedCard === card) {
      card.setSelected(false);
      this.selectedCard = null;
    } else {
      card.setSelected(true);
      this.selectedCard = card;
      this.emit('cardSelected', card);
    }
  }

  private arrangeCards(): void {
    const cardCount = this.cards.length;
    if (cardCount === 0) return;

    // Calculate spacing based on available width
    const maxSpacing = CARD_WIDTH + 10;
    const totalWidthNeeded = cardCount * CARD_WIDTH + (cardCount - 1) * 10;
    const availableWidth = Hand.MAX_VISIBLE_WIDTH;

    let spacing: number;
    if (totalWidthNeeded <= availableWidth) {
      spacing = maxSpacing;
    } else {
      spacing = (availableWidth - CARD_WIDTH) / (cardCount - 1);
    }

    const totalWidth = CARD_WIDTH + spacing * (cardCount - 1);
    const startX = -totalWidth / 2 + CARD_WIDTH / 2;

    this.cards.forEach((card, index) => {
      const x = startX + index * spacing;
      card.moveTo(x, 0);
      card.zIndex = index;
    });

    this.sortChildren();
  }

  getSelectedCard(): Card | null {
    return this.selectedCard;
  }

  clearSelection(): void {
    if (this.selectedCard) {
      this.selectedCard.setSelected(false);
      this.selectedCard = null;
    }
  }

  getCards(): Card[] {
    return [...this.cards];
  }

  getCardData(): CardData[] {
    return this.cards.map(card => card.cardData);
  }

  getCardCount(): number {
    return this.cards.length;
  }

  hasCards(): boolean {
    return this.cards.length > 0;
  }

  clear(): void {
    this.cards.forEach(card => {
      this.removeChild(card);
    });
    this.cards = [];
    this.selectedCard = null;
  }

  // Sort cards by month for better UX
  sortByMonth(): void {
    this.cards.sort((a, b) => a.getMonth() - b.getMonth());
    this.arrangeCards();
  }

  setCardsFromData(cardData: CardData[], options?: { showFront?: boolean }): void {
    this.clear();

    const showFront = options?.showFront ?? this.isPlayer;

    cardData.forEach(data => {
      const card = new Card(data);
      if (!showFront) {
        try {
          card.texture = Texture.from('card_back');
        } catch {
          // fallback to default texture already assigned in constructor
        }
      }
      this.addCard(card);
    });

    if (this.isPlayer) {
      this.sortByMonth();
    } else {
      this.arrangeCards();
    }
  }
}
