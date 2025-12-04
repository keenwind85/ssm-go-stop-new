import { Container, Graphics, Text, TextStyle, Application, DestroyOptions } from 'pixi.js';
import { Button } from './Button';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, FONTS } from '@utils/constants';

interface InputModalOptions {
  app: Application;
  title: string;
  defaultValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export class InputModal extends Container {
  private app: Application;
  private onConfirm: (value: string) => void;
  private onCancel: () => void;
  private inputElement: HTMLInputElement | null = null;

  constructor(options: InputModalOptions) {
    super();

    this.app = options.app;
    this.onConfirm = options.onConfirm;
    this.onCancel = options.onCancel;

    this.zIndex = 1000;
    this.interactive = true;

    // Background overlay
    const overlay = new Graphics();
    overlay.rect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    overlay.fill({ color: 0x000000, alpha: 0.7 });
    overlay.interactive = true; // Prevent clicks from passing through
    this.addChild(overlay);

    // Modal panel
    const modalWidth = 500;
    const modalHeight = 300;
    const panel = new Graphics();
    panel.roundRect(
      (GAME_WIDTH - modalWidth) / 2,
      (GAME_HEIGHT - modalHeight) / 2,
      modalWidth,
      modalHeight,
      16
    );
    panel.fill(COLORS.SECONDARY);
    panel.stroke({ width: 2, color: COLORS.PRIMARY });
    this.addChild(panel);

    // Title
    const titleText = new Text({
        text: options.title,
        style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: 28,
        fontWeight: 'bold',
        fill: COLORS.TEXT,
        }),
    });
    titleText.anchor.set(0.5);
    titleText.position.set(GAME_WIDTH / 2, (GAME_HEIGHT - modalHeight) / 2 + 50);
    this.addChild(titleText);

    // Create and position the HTML input element
    this.createInputElement(options.defaultValue);

    // Buttons
    const confirmButton = new Button({
      text: '확인',
      width: 150,
      height: 60,
      backgroundColor: COLORS.SUCCESS,
      textColor: COLORS.TEXT,
      fontSize: 22,
      onClick: this.handleConfirm.bind(this),
    });
    confirmButton.position.set(
      GAME_WIDTH / 2 - 95,
      (GAME_HEIGHT + modalHeight) / 2 - 80
    );
    this.addChild(confirmButton);

    const cancelButton = new Button({
      text: '취소',
      width: 150,
      height: 60,
      backgroundColor: COLORS.ERROR,
      textColor: COLORS.TEXT,
      fontSize: 22,
      onClick: this.handleCancel.bind(this),
    });
    cancelButton.position.set(
      GAME_WIDTH / 2 + 95,
      (GAME_HEIGHT + modalHeight) / 2 - 80
    );
    this.addChild(cancelButton);
  }

  private createInputElement(defaultValue = ''): void {
    this.inputElement = document.createElement('input');
    this.inputElement.type = 'text';
    this.inputElement.className = 'game-input';
    this.inputElement.value = defaultValue;
    this.inputElement.maxLength = 20;

    document.body.appendChild(this.inputElement);
    this.repositionInputElement();

    // Focus the element so the user can start typing
    this.inputElement.focus();
    
    // Reposition on window resize
    window.addEventListener('resize', this.repositionInputElement);
  }
  
  private repositionInputElement = (): void => {
    if (!this.inputElement) return;

    const canvas = this.app.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / GAME_WIDTH;
    const scaleY = rect.height / GAME_HEIGHT;

    // Center of the modal's input area in game coordinates
    const inputX = GAME_WIDTH / 2;
    const inputY = GAME_HEIGHT / 2;

    // Convert to screen coordinates
    const screenX = rect.left + inputX * scaleX;
    const screenY = rect.top + inputY * scaleY;

    this.inputElement.style.left = `${screenX - this.inputElement.offsetWidth / 2}px`;
    this.inputElement.style.top = `${screenY - this.inputElement.offsetHeight / 2 - 20}px`;
  }

  private handleConfirm(): void {
    if (this.inputElement) {
      this.onConfirm(this.inputElement.value.trim());
    }
  }

  private handleCancel(): void {
    this.onCancel();
  }

  public destroy(options?: boolean | DestroyOptions | undefined): void {
    window.removeEventListener('resize', this.repositionInputElement);
    if (this.inputElement) {
      document.body.removeChild(this.inputElement);
      this.inputElement = null;
    }
    super.destroy(options);
  }
}
