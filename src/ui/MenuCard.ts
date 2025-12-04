import { Container, Graphics, Text, TextStyle, Rectangle } from 'pixi.js';
import gsap from 'gsap';
import { COLORS, FONTS } from '@utils/constants';

interface MenuCardOptions {
  title: string;
  description: string;
  icon: string;
  width: number;
  height: number;
  onClick: () => void;
}

export class MenuCard extends Container {
  private background: Graphics;
  private options: MenuCardOptions;

  constructor(options: MenuCardOptions) {
    super();
    this.options = options;

    // Create background and shadow
    this.background = new Graphics();
    this.drawBackground();
    this.addChild(this.background);

    // Icon
    const iconText = new Text({
        text: options.icon,
        style: new TextStyle({ fontSize: 64 }),
    });
    iconText.anchor.set(0.5);
    iconText.position.set(options.width / 2, options.height * 0.35);
    this.addChild(iconText);

    // Title
    const titleText = new Text({
        text: options.title,
        style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: 36,
        fontWeight: 'bold',
        fill: COLORS.TEXT,
      }),
    });
    titleText.anchor.set(0.5);
    titleText.position.set(options.width / 2, options.height * 0.65);
    this.addChild(titleText);

    // Description
    const descriptionText = new Text({
        text: options.description,
        style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: 16,
        fill: COLORS.TEXT_MUTED,
      }),
    });
    descriptionText.anchor.set(0.5);
    descriptionText.position.set(options.width / 2, options.height * 0.8);
    this.addChild(descriptionText);

    // Interaction
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(0, 0, options.width, options.height);

    this.pivot.set(options.width / 2, options.height / 2);
    this.setupEvents();
  }

  private drawBackground(strokeColor: number = COLORS.PRIMARY, strokeAlpha: number = 0.5): void {
    this.background.clear();
    // Shadow
    this.background.roundRect(5, 5, this.options.width, this.options.height, 20);
    this.background.fill({ color: 0x000000, alpha: 0.2 });
    // Main shape
    this.background.roundRect(0, 0, this.options.width, this.options.height, 16);
    this.background.fill(COLORS.SECONDARY);
    this.background.stroke({ width: 2, color: strokeColor, alpha: strokeAlpha });
  }
  
  private setupEvents(): void {
    this.on('pointerover', this.onPointerOver, this);
    this.on('pointerout', this.onPointerOut, this);
    this.on('pointerdown', this.onPointerDown, this);
    this.on('pointerup', this.onPointerUp, this);
    this.on('pointerupoutside', this.onPointerUp, this);
  }

  private onPointerOver(): void {
    gsap.to(this.scale, { x: 1.05, y: 1.05, duration: 0.2, ease: 'power2.out' });
    this.drawBackground(COLORS.WARNING, 1);
  }

  private onPointerOut(): void {
    gsap.to(this.scale, { x: 1, y: 1, duration: 0.2, ease: 'power2.out' });
    this.drawBackground(COLORS.PRIMARY, 0.5);
  }
  
  private onPointerDown(): void {
    gsap.to(this.scale, { x: 1.02, y: 1.02, duration: 0.1, ease: 'power2.out' });
  }

  private onPointerUp(event: any): void {
     // Check if the pointer is still inside the button bounds on pointerup
    const localPoint = this.toLocal(event.global);
    const hitArea = this.hitArea as Rectangle;
    if (hitArea && hitArea.contains(localPoint.x, localPoint.y)) {
        this.options.onClick();
    }
    gsap.to(this.scale, { x: 1.05, y: 1.05, duration: 0.1, ease: 'back.out(2)' });
  }
}
