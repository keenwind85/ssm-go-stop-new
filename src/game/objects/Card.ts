import { Sprite, Texture, Graphics, Text, TextStyle } from 'pixi.js';
import gsap from 'gsap';
import { CARD_WIDTH, CARD_HEIGHT, COLORS, ANIMATION_DURATION } from '@utils/constants';
import { CardType, CardData } from '@utils/types';

export class Card extends Sprite {
  public readonly cardData: CardData;
  private isFlipped: boolean = false;
  private isSelected: boolean = false;
  private isMatchHighlighted: boolean = false;
  private highlight: Graphics;
  private matchIndicator: Text | null = null;
  private matchTween: gsap.core.Tween | null = null;
  private originalY: number = 0;

  constructor(cardData: CardData) {
    // Texture name format: card_01_1, card_02_3, etc.
    const textureName = `card_${cardData.month.toString().padStart(2, '0')}_${cardData.index}`;
    let texture: Texture;
    try {
      texture = Texture.from(textureName);
    } catch {
      console.warn(`Texture not found: ${textureName}`);
      texture = Texture.WHITE;
    }
    super(texture);

    this.cardData = cardData;
    this.anchor.set(0.5);
    this.width = CARD_WIDTH;
    this.height = CARD_HEIGHT;

    // Create highlight overlay (outside the card with thick border)
    const highlightPadding = 8;
    const highlightWidth = 6;
    this.highlight = new Graphics();
    this.highlight.roundRect(
      -CARD_WIDTH / 2 - highlightPadding,
      -CARD_HEIGHT / 2 - highlightPadding,
      CARD_WIDTH + highlightPadding * 2,
      CARD_HEIGHT + highlightPadding * 2,
      12
    );
    this.highlight.stroke({ width: highlightWidth, color: COLORS.CARD_HIGHLIGHT });
    this.highlight.visible = false;
    this.addChild(this.highlight);

    // Enable interaction
    this.eventMode = 'static';
    this.cursor = 'pointer';

    this.setupEvents();
  }

  private setupEvents(): void {
    this.on('pointerdown', this.onPointerDown, this);
    this.on('pointerover', this.onPointerOver, this);
    this.on('pointerout', this.onPointerOut, this);
  }

  private onPointerDown(): void {
    console.log('[Card] onPointerDown - Card clicked:', this.cardData.id);
    this.emit('selected', this);
  }

  private onPointerOver(): void {
    if (!this.isSelected) {
      gsap.to(this, {
        y: this.originalY - 15,
        duration: 0.15,
        ease: 'power2.out',
      });
    }
  }

  private onPointerOut(): void {
    if (!this.isSelected) {
      gsap.to(this, {
        y: this.originalY,
        duration: 0.15,
        ease: 'power2.out',
      });
    }
  }

  setSelected(selected: boolean): void {
    this.isSelected = selected;
    this.highlight.visible = selected;

    if (selected) {
      gsap.to(this, {
        y: this.originalY - 20,
        duration: 0.2,
        ease: 'back.out(2)',
      });
    } else {
      gsap.to(this, {
        y: this.originalY,
        duration: 0.2,
        ease: 'power2.out',
      });
    }
  }

  async moveTo(x: number, y: number, duration = ANIMATION_DURATION.CARD_MOVE): Promise<void> {
    this.originalY = y;
    await gsap.to(this, {
      x,
      y,
      duration,
      ease: 'power2.out',
    });
  }

  async flip(showFront: boolean): Promise<void> {
    await gsap.to(this.scale, {
      x: 0,
      duration: ANIMATION_DURATION.CARD_FLIP / 2,
      ease: 'power2.in',
    });

    if (showFront) {
      const textureName = `card_${this.cardData.month.toString().padStart(2, '0')}_${this.cardData.index}`;
      try {
        this.texture = Texture.from(textureName);
      } catch {
        this.texture = Texture.WHITE;
      }
    } else {
      try {
        this.texture = Texture.from('card_back');
      } catch {
        this.texture = Texture.WHITE;
      }
    }

    this.isFlipped = !this.isFlipped;

    await gsap.to(this.scale, {
      x: 1,
      duration: ANIMATION_DURATION.CARD_FLIP / 2,
      ease: 'power2.out',
    });
  }

  async dealAnimation(targetX: number, targetY: number, delay = 0): Promise<void> {
    this.alpha = 0;
    this.scale.set(0.5);

    await gsap.to(this, {
      x: targetX,
      y: targetY,
      alpha: 1,
      delay,
      duration: ANIMATION_DURATION.CARD_DEAL,
      ease: 'back.out(1.5)',
    });

    gsap.to(this.scale, {
      x: 1,
      y: 1,
      duration: ANIMATION_DURATION.CARD_DEAL,
      ease: 'back.out(1.5)',
    });

    this.originalY = targetY;
  }

  async collectAnimation(targetX: number, targetY: number): Promise<void> {
    await gsap.to(this, {
      x: targetX,
      y: targetY,
      scale: 0.6,
      duration: ANIMATION_DURATION.CARD_COLLECT,
      ease: 'power2.inOut',
    });
  }

  getMonth(): number {
    return this.cardData.month;
  }

  getType(): CardType {
    return this.cardData.type;
  }

  getId(): string {
    return this.cardData.id;
  }

  // 매칭 카드 하이라이트 (화살표 애니메이션만 - 카드 중앙에 표시, 테두리 없음)
  setMatchHighlight(highlighted: boolean): void {
    if (this.isMatchHighlighted === highlighted) return;
    this.isMatchHighlighted = highlighted;

    // 매칭 하이라이트에서는 금색 테두리 절대 표시 안함 (선택 상태 무관)
    this.highlight.visible = false;

    if (highlighted) {
      // Create arrow indicator if not exists (centered on card, no border)
      if (!this.matchIndicator) {
        this.matchIndicator = new Text({
          text: '⬇',
          style: new TextStyle({
            fontSize: 148,
            fill: COLORS.CARD_HIGHLIGHT,
            fontWeight: 'bold',
            dropShadow: {
              color: 0x000000,
              blur: 6,
              distance: 3,
              alpha: 0.7,
            },
          }),
        });
        this.matchIndicator.anchor.set(0.5);
        this.matchIndicator.position.set(0, -15);
        this.addChild(this.matchIndicator);
      }

      this.matchIndicator.visible = true;
      this.matchIndicator.alpha = 1;

      // Animate arrow bouncing at card center
      if (this.matchTween) {
        this.matchTween.kill();
      }
      this.matchTween = gsap.to(this.matchIndicator, {
        y: 5,
        duration: 0.5,
        repeat: -1,
        yoyo: true,
        ease: 'power1.inOut',
      });
    } else {
      // Stop and hide arrow
      if (this.matchTween) {
        this.matchTween.kill();
        this.matchTween = null;
      }

      if (this.matchIndicator) {
        this.matchIndicator.visible = false;
      }
    }
  }

  // 카드 매칭 애니메이션 (바닥패와 합쳐지는 효과)
  async matchWithCard(targetCard: Card): Promise<void> {
    const targetPos = targetCard.getGlobalPosition();
    const myPos = this.getGlobalPosition();

    // Increase z-index to show card on top during match
    const originalZIndex = this.zIndex;
    this.zIndex = 1000;

    // Animate to exact target position for clear overlap effect
    await gsap.to(this, {
      x: this.x + (targetPos.x - myPos.x),
      y: this.y + (targetPos.y - myPos.y),
      scale: 1.05,
      rotation: 0,
      duration: ANIMATION_DURATION.CARD_MOVE * 0.8,
      ease: 'power2.out',
    });

    // Hold the overlap state longer for realistic matching effect
    await new Promise(resolve => setTimeout(resolve, 300));

    // Scale back and flash effect
    await gsap.to(this, {
      scale: 1.0,
      alpha: 0.8,
      duration: 0.15,
      yoyo: true,
      repeat: 1,
    });

    // Restore original z-index
    this.zIndex = originalZIndex;
  }

  getOriginalY(): number {
    return this.originalY;
  }

  setOriginalY(y: number): void {
    this.originalY = y;
  }
}
