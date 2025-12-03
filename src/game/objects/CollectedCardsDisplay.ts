import { Container, Graphics, Text, TextStyle, Sprite, Texture } from 'pixi.js';
import { Card } from './Card';
import { COLORS } from '@utils/constants';
import { CardType, CardData } from '@utils/types';

interface CollectedCardGroup {
  container: Container;
  cardContainer: Container;
  sprites: Sprite[];
  countText: Text;
  label: Text;
}

export class CollectedCardsDisplay extends Container {
  private groups: Map<CardType, CollectedCardGroup> = new Map();
  private totalScoreText: Text;
  private background: Graphics;

  // Card display dimensions
  private static readonly CARD_WIDTH = 32;
  private static readonly CARD_HEIGHT = 48;
  private static readonly CARD_OVERLAP = 18;
  private static readonly GROUP_WIDTH = 80;
  private static readonly GROUP_SPACING = 6;

  constructor(isPlayer: boolean) {
    super();

    // Create background (sized to fit within right panel)
    this.background = new Graphics();
    this.background.roundRect(-175, -85, 350, 170, 10);
    this.background.fill({ color: COLORS.SECONDARY, alpha: 0.7 });
    this.background.stroke({ width: 2, color: isPlayer ? COLORS.PRIMARY : COLORS.WARNING, alpha: 0.8 });
    this.addChild(this.background);

    // Create label
    const labelText = new Text({
      text: isPlayer ? '나의 점수패' : '상대 점수패',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 14,
        fontWeight: 'bold',
        fill: isPlayer ? COLORS.PRIMARY : COLORS.WARNING,
      }),
    });
    labelText.anchor.set(0.5);
    labelText.position.set(0, -70);
    this.addChild(labelText);

    // Create groups for each card type
    this.createCardGroups();

    // Create total score display
    this.totalScoreText = new Text({
      text: '0점',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 18,
        fontWeight: 'bold',
        fill: COLORS.TEXT,
      }),
    });
    this.totalScoreText.anchor.set(0.5);
    this.totalScoreText.position.set(0, 70);
    this.addChild(this.totalScoreText);
  }

  private createCardGroups(): void {
    const types: { type: CardType; label: string }[] = [
      { type: 'kwang', label: '광' },
      { type: 'animal', label: '열' },
      { type: 'ribbon', label: '띠' },
      { type: 'pi', label: '피' },
    ];

    const totalWidth = types.length * CollectedCardsDisplay.GROUP_WIDTH +
                       (types.length - 1) * CollectedCardsDisplay.GROUP_SPACING;
    const startX = -totalWidth / 2 + CollectedCardsDisplay.GROUP_WIDTH / 2;

    types.forEach((typeInfo, index) => {
      const group = this.createCardGroup(typeInfo.label);
      group.container.position.set(
        startX + index * (CollectedCardsDisplay.GROUP_WIDTH + CollectedCardsDisplay.GROUP_SPACING),
        0
      );
      this.addChild(group.container);
      this.groups.set(typeInfo.type, group);
    });
  }

  private createCardGroup(label: string): CollectedCardGroup {
    const container = new Container();
    container.sortableChildren = true;

    // Group background
    const bg = new Graphics();
    bg.roundRect(-38, -50, 76, 100, 6);
    bg.fill({ color: 0x000000, alpha: 0.3 });
    container.addChild(bg);

    // Label at top
    const labelText = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 12,
        fontWeight: 'bold',
        fill: COLORS.TEXT_MUTED,
      }),
    });
    labelText.anchor.set(0.5);
    labelText.position.set(0, -38);
    labelText.zIndex = 100;
    container.addChild(labelText);

    // Card container for stacked cards
    const cardContainer = new Container();
    cardContainer.sortableChildren = true;
    cardContainer.position.set(0, 5);
    container.addChild(cardContainer);

    // Count text (badge style at bottom right)
    const countBg = new Graphics();
    countBg.circle(28, 32, 12);
    countBg.fill({ color: COLORS.PRIMARY, alpha: 0.9 });
    countBg.zIndex = 200;
    container.addChild(countBg);

    const countText = new Text({
      text: '0',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 12,
        fontWeight: 'bold',
        fill: COLORS.TEXT,
      }),
    });
    countText.anchor.set(0.5);
    countText.position.set(28, 32);
    countText.zIndex = 201;
    container.addChild(countText);

    return {
      container,
      cardContainer,
      sprites: [],
      countText,
      label: labelText,
    };
  }

  updateFromCards(cardGroups: { kwang: Card[]; animal: Card[]; ribbon: Card[]; pi: Card[] }): void {
    // Update each group with its cards
    this.updateGroupCards('kwang', cardGroups.kwang);
    this.updateGroupCards('animal', cardGroups.animal);
    this.updateGroupCards('ribbon', cardGroups.ribbon);
    this.updateGroupCards('pi', cardGroups.pi);
  }

  updateFromCardData(cardGroups: { kwang: CardData[]; animal: CardData[]; ribbon: CardData[]; pi: CardData[] }): void {
    this.updateFromCards({
      kwang: cardGroups.kwang.map(data => new Card(data)),
      animal: cardGroups.animal.map(data => new Card(data)),
      ribbon: cardGroups.ribbon.map(data => new Card(data)),
      pi: cardGroups.pi.map(data => new Card(data)),
    });
  }

  private updateGroupCards(type: CardType, cards: Card[]): void {
    const group = this.groups.get(type);
    if (!group) return;

    // Clear existing sprites
    group.sprites.forEach(sprite => {
      group.cardContainer.removeChild(sprite);
      sprite.destroy();
    });
    group.sprites = [];

    // Calculate layout based on card count
    const maxVisible = 5; // Max cards to show before condensing
    const cardCount = cards.length;
    const visibleCards = cards.slice(-maxVisible); // Show last N cards

    // Calculate overlap based on card count
    let overlap = CollectedCardsDisplay.CARD_OVERLAP;
    if (visibleCards.length > 3) {
      overlap = CollectedCardsDisplay.CARD_OVERLAP - (visibleCards.length - 3) * 3;
    }

    const totalWidth = visibleCards.length > 0
      ? CollectedCardsDisplay.CARD_WIDTH + (visibleCards.length - 1) * (CollectedCardsDisplay.CARD_WIDTH - overlap)
      : 0;
    const startX = -totalWidth / 2 + CollectedCardsDisplay.CARD_WIDTH / 2;

    // Create sprites for each card
    visibleCards.forEach((card, index) => {
      const textureName = `card_${card.cardData.month.toString().padStart(2, '0')}_${card.cardData.index}`;
      let texture: Texture;
      try {
        texture = Texture.from(textureName);
      } catch {
        texture = Texture.WHITE;
      }

      const cardSprite = new Sprite(texture);
      cardSprite.anchor.set(0.5);
      cardSprite.width = CollectedCardsDisplay.CARD_WIDTH;
      cardSprite.height = CollectedCardsDisplay.CARD_HEIGHT;

      // Position cards with overlap
      const xPos = startX + index * (CollectedCardsDisplay.CARD_WIDTH - overlap);
      cardSprite.position.set(xPos, 0);
      cardSprite.zIndex = index;

      // Add slight rotation for visual interest
      cardSprite.rotation = (index - (visibleCards.length - 1) / 2) * 0.03;

      group.cardContainer.addChild(cardSprite);
      group.sprites.push(cardSprite);
    });

    // Update count
    group.countText.text = cardCount.toString();
  }

  updateFromCounts(counts: { kwang: number; animal: number; ribbon: number; pi: number }): void {
    const kwangGroup = this.groups.get('kwang');
    const animalGroup = this.groups.get('animal');
    const ribbonGroup = this.groups.get('ribbon');
    const piGroup = this.groups.get('pi');

    if (kwangGroup) kwangGroup.countText.text = counts.kwang.toString();
    if (animalGroup) animalGroup.countText.text = counts.animal.toString();
    if (ribbonGroup) ribbonGroup.countText.text = counts.ribbon.toString();
    if (piGroup) piGroup.countText.text = counts.pi.toString();
  }

  updateTotalScore(score: number): void {
    this.totalScoreText.text = `${score}점`;
  }

  clear(): void {
    this.groups.forEach((group) => {
      group.sprites.forEach(sprite => {
        group.cardContainer.removeChild(sprite);
        sprite.destroy();
      });
      group.sprites = [];
      group.countText.text = '0';
    });
    this.totalScoreText.text = '0점';
  }
}
