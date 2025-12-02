import { Container, Graphics, Text, TextStyle, Sprite, Texture } from 'pixi.js';
import { Card } from './Card';
import { CARD_WIDTH, CARD_HEIGHT, COLORS } from '@utils/constants';
import { CardData, CardType } from '@utils/types';
import { shuffleArray } from '@utils/helpers';

// 화투 카드 데이터 정의
const CARD_DEFINITIONS: Array<{ month: number; index: number; type: CardType }> = [
  // 1월 (송학) - 광, 띠, 피, 피
  { month: 1, index: 1, type: 'kwang' },    // 1월 광 (학)
  { month: 1, index: 2, type: 'ribbon' },   // 1월 홍단
  { month: 1, index: 3, type: 'pi' },
  { month: 1, index: 4, type: 'pi' },

  // 2월 (매조) - 동물, 띠, 피, 피
  { month: 2, index: 1, type: 'animal' },   // 꾀꼬리
  { month: 2, index: 2, type: 'ribbon' },   // 2월 홍단
  { month: 2, index: 3, type: 'pi' },
  { month: 2, index: 4, type: 'pi' },

  // 3월 (벚꽃) - 광, 띠, 피, 피
  { month: 3, index: 1, type: 'kwang' },    // 3월 광 (커튼)
  { month: 3, index: 2, type: 'ribbon' },   // 3월 홍단
  { month: 3, index: 3, type: 'pi' },
  { month: 3, index: 4, type: 'pi' },

  // 4월 (등나무) - 동물, 띠, 피, 피
  { month: 4, index: 1, type: 'animal' },   // 두견새
  { month: 4, index: 2, type: 'ribbon' },   // 4월 초단
  { month: 4, index: 3, type: 'pi' },
  { month: 4, index: 4, type: 'pi' },

  // 5월 (난초) - 동물, 띠, 피, 피
  { month: 5, index: 1, type: 'animal' },   // 나비
  { month: 5, index: 2, type: 'ribbon' },   // 5월 초단
  { month: 5, index: 3, type: 'pi' },
  { month: 5, index: 4, type: 'pi' },

  // 6월 (모란) - 동물, 띠, 피, 피
  { month: 6, index: 1, type: 'animal' },   // 나비
  { month: 6, index: 2, type: 'ribbon' },   // 6월 청단
  { month: 6, index: 3, type: 'pi' },
  { month: 6, index: 4, type: 'pi' },

  // 7월 (홍싸리) - 동물, 띠, 피, 피
  { month: 7, index: 1, type: 'animal' },   // 멧돼지
  { month: 7, index: 2, type: 'ribbon' },   // 7월 초단
  { month: 7, index: 3, type: 'pi' },
  { month: 7, index: 4, type: 'pi' },

  // 8월 (공산) - 광, 동물, 피, 피
  { month: 8, index: 1, type: 'kwang' },    // 8월 광 (공산명월)
  { month: 8, index: 2, type: 'animal' },   // 기러기
  { month: 8, index: 3, type: 'pi' },
  { month: 8, index: 4, type: 'pi' },

  // 9월 (국화) - 동물, 띠, 피, 피
  { month: 9, index: 1, type: 'animal' },   // 국진이 (술잔)
  { month: 9, index: 2, type: 'ribbon' },   // 9월 청단
  { month: 9, index: 3, type: 'pi' },
  { month: 9, index: 4, type: 'pi' },

  // 10월 (단풍) - 동물, 띠, 피, 피
  { month: 10, index: 1, type: 'animal' },  // 사슴
  { month: 10, index: 2, type: 'ribbon' },  // 10월 청단
  { month: 10, index: 3, type: 'pi' },
  { month: 10, index: 4, type: 'pi' },

  // 11월 (오동) - 광, 피, 피, 쌍피
  { month: 11, index: 1, type: 'kwang' },   // 11월 광 (비광/오동)
  { month: 11, index: 2, type: 'pi' },
  { month: 11, index: 3, type: 'pi' },
  { month: 11, index: 4, type: 'pi' },      // 쌍피 (2점)

  // 12월 (비) - 광, 동물, 띠, 피
  { month: 12, index: 1, type: 'kwang' },   // 12월 광 (비광)
  { month: 12, index: 2, type: 'animal' },  // 제비
  { month: 12, index: 3, type: 'ribbon' },  // 12월 띠
  { month: 12, index: 4, type: 'pi' },      // 쌍피 (2점)
];

export class Deck extends Container {
  private cards: Card[] = [];
  private deckContainer: Container;
  private deckSprites: Sprite[] = [];
  private countText: Text;
  private countBg: Graphics;

  constructor() {
    super();

    // Create deck container for stacked card backs
    this.deckContainer = new Container();
    this.deckContainer.sortableChildren = true;
    this.addChild(this.deckContainer);

    // Create stacked card back images
    this.createDeckVisual();

    // Create card count background
    this.countBg = new Graphics();
    this.countBg.circle(0, 0, 25);
    this.countBg.fill({ color: COLORS.PRIMARY, alpha: 0.9 });
    this.countBg.position.set(CARD_WIDTH / 2 - 10, -CARD_HEIGHT / 2 + 10);
    this.addChild(this.countBg);

    // Create card count text
    this.countText = new Text({
      text: '48',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 18,
        fontWeight: 'bold',
        fill: COLORS.TEXT,
      }),
    });
    this.countText.anchor.set(0.5);
    this.countText.position.set(CARD_WIDTH / 2 - 10, -CARD_HEIGHT / 2 + 10);
    this.addChild(this.countText);

    // Initialize and shuffle cards
    this.initializeCards();
    this.updateCountDisplay();
  }

  private createDeckVisual(): void {
    // Clear existing sprites
    this.deckSprites.forEach(sprite => {
      this.deckContainer.removeChild(sprite);
      sprite.destroy();
    });
    this.deckSprites = [];

    // Get deck back texture (served from dist/assets/cards/덱_뒷면.png after build)
    const deckBackTexturePath = '/assets/cards/보너스_1.png';
    let texture: Texture;
    try {
      texture = Texture.from(deckBackTexturePath);
    } catch (error) {
      console.warn('Deck back texture not found, falling back to default card back', error);
      try {
        texture = Texture.from('card_back');
      } catch {
        texture = Texture.WHITE;
      }
    }

    // Create stacked card back images (5 cards visible)
    const stackCount = 5;
    for (let i = 0; i < stackCount; i++) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.width = CARD_WIDTH;
      sprite.height = CARD_HEIGHT;
      sprite.position.set(i * 2, i * 2);
      sprite.zIndex = i;

      this.deckContainer.addChild(sprite);
      this.deckSprites.push(sprite);
    }
  }

  private updateCountDisplay(): void {
    this.countText.text = this.cards.length.toString();
    this.countBg.visible = this.cards.length > 0;
    this.countText.visible = this.cards.length > 0;
  }

  private initializeCards(): void {
    this.cards = CARD_DEFINITIONS.map((def) => {
      const cardData: CardData = {
        id: `card_${def.month}_${def.index}`,
        month: def.month,
        index: def.index,
        type: def.type,
      };
      return new Card(cardData);
    });
  }

  shuffle(): void {
    this.cards = shuffleArray(this.cards);
  }

  draw(): Card | undefined {
    const card = this.cards.pop();

    // Update deck visual and count
    this.updateCountDisplay();
    if (this.cards.length === 0) {
      this.deckContainer.visible = false;
    }

    return card;
  }

  drawMultiple(count: number): Card[] {
    const drawnCards: Card[] = [];
    for (let i = 0; i < count; i++) {
      const card = this.draw();
      if (card) {
        drawnCards.push(card);
      }
    }
    return drawnCards;
  }

  getRemainingCount(): number {
    return this.cards.length;
  }

  reset(): void {
    // Remove all cards from display
    this.cards.forEach(card => {
      if (card.parent) {
        card.parent.removeChild(card);
      }
    });

    // Reinitialize
    this.initializeCards();
    this.shuffle();
    this.deckContainer.visible = true;
    this.updateCountDisplay();
  }
}
