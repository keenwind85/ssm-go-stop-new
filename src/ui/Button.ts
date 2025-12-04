import { Container, Graphics, Text, TextStyle, Rectangle } from 'pixi.js';
import gsap from 'gsap';
import { COLORS, FONTS } from '@utils/constants';

interface ButtonOptions {
  text: string;
  width: number;
  height: number;
  backgroundColor?: number;
  textColor?: number;
  fontSize?: number;
  borderRadius?: number;
  onClick?: () => void;
}

export class Button extends Container {
  private background: Graphics;
  private labelText: Text;
  private options: Required<ButtonOptions>;
  private isPressed: boolean = false;
  private isDisabled: boolean = false;

  constructor(options: ButtonOptions) {
    super();

    this.options = {
      text: options.text,
      width: options.width,
      height: options.height,
      backgroundColor: options.backgroundColor ?? COLORS.PRIMARY,
      textColor: options.textColor ?? COLORS.TEXT,
      fontSize: options.fontSize ?? 20,
      borderRadius: options.borderRadius ?? 10,
      onClick: options.onClick ?? (() => {}),
    };

    // Create background
    this.background = new Graphics();
    this.drawBackground(this.options.backgroundColor);
    this.addChild(this.background);

    // Create label (centered in button)
    this.labelText = new Text({
      text: this.options.text,
      style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: this.options.fontSize,
        fontWeight: 'bold',
        fill: this.options.textColor,
      }),
    });
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(this.options.width / 2, this.options.height / 2);
    this.addChild(this.labelText);

    // Set pivot to center for positioning
    this.pivot.set(this.options.width / 2, this.options.height / 2);

    // Enable interaction with explicit hit area
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(0, 0, this.options.width, this.options.height);

    this.setupEvents();
  }

  private drawBackground(color: number): void {
    this.background.clear();
    this.background.roundRect(
      0,
      0,
      this.options.width,
      this.options.height,
      this.options.borderRadius
    );
    this.background.fill(color);
  }

  private setupEvents(): void {
    this.on('pointerdown', this.onPointerDown, this);
    this.on('pointerup', this.onPointerUp, this);
    this.on('pointerupoutside', this.onPointerUp, this);
    this.on('pointerover', this.onPointerOver, this);
    this.on('pointerout', this.onPointerOut, this);
  }

  private onPointerDown(): void {
    if (this.isDisabled) return;

    this.isPressed = true;
    gsap.to(this.scale, {
      x: 0.95,
      y: 0.95,
      duration: 0.1,
      ease: 'power2.out',
    });
  }

  private onPointerUp(): void {
    if (this.isDisabled) return;

    if (this.isPressed) {
      this.options.onClick();
    }

    this.isPressed = false;
    gsap.to(this.scale, {
      x: 1,
      y: 1,
      duration: 0.1,
      ease: 'back.out(2)',
    });
  }

  private onPointerOver(): void {
    if (this.isDisabled) return;

    const hoverColor = this.lightenColor(this.options.backgroundColor, 20);
    this.drawBackground(hoverColor);
  }

  private onPointerOut(): void {
    if (this.isDisabled) return;

    this.isPressed = false;
    this.drawBackground(this.options.backgroundColor);
    gsap.to(this.scale, {
      x: 1,
      y: 1,
      duration: 0.1,
    });
  }

  private lightenColor(color: number, amount: number): number {
    const r = Math.min(255, ((color >> 16) & 0xff) + amount);
    const g = Math.min(255, ((color >> 8) & 0xff) + amount);
    const b = Math.min(255, (color & 0xff) + amount);
    return (r << 16) | (g << 8) | b;
  }

  setText(text: string): void {
    this.labelText.text = text;
  }

  setDisabled(disabled: boolean): void {
    this.isDisabled = disabled;
    this.alpha = disabled ? 0.5 : 1;
    this.cursor = disabled ? 'default' : 'pointer';
  }

  setBackgroundColor(color: number): void {
    this.options.backgroundColor = color;
    this.drawBackground(color);
  }
}
