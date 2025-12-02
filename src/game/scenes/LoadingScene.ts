import { Application, Graphics, Text, TextStyle } from 'pixi.js';
import { Scene } from './Scene';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '@utils/constants';

export class LoadingScene extends Scene {
  private progressBar: Graphics;
  private progressText: Text;
  private progress: number = 0;

  constructor(app: Application) {
    super(app);
    this.progressBar = new Graphics();
    this.progressText = new Text({
      text: '0%',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 24,
        fill: COLORS.TEXT,
      }),
    });
  }

  async onEnter(): Promise<void> {
    // Background
    const bg = new Graphics();
    bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    bg.fill(COLORS.BACKGROUND);
    this.container.addChild(bg);

    // Title
    const title = new Text({
      text: '고스톱',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 48,
        fontWeight: 'bold',
        fill: COLORS.PRIMARY,
      }),
    });
    title.anchor.set(0.5);
    title.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 100);
    this.container.addChild(title);

    // Progress bar background
    const barWidth = 300;
    const barHeight = 20;
    const barX = (GAME_WIDTH - barWidth) / 2;
    const barY = GAME_HEIGHT / 2;

    const barBg = new Graphics();
    barBg.roundRect(barX, barY, barWidth, barHeight, 10);
    barBg.fill(COLORS.SECONDARY);
    this.container.addChild(barBg);

    // Progress bar foreground
    this.progressBar.position.set(barX, barY);
    this.container.addChild(this.progressBar);

    // Progress text
    this.progressText.anchor.set(0.5);
    this.progressText.position.set(GAME_WIDTH / 2, barY + 50);
    this.container.addChild(this.progressText);
  }

  onExit(): void {
    this.container.removeChildren();
  }

  setProgress(value: number): void {
    this.progress = Math.min(Math.max(value, 0), 1);

    const barWidth = 300 * this.progress;
    const barHeight = 20;

    this.progressBar.clear();
    this.progressBar.roundRect(0, 0, barWidth, barHeight, 10);
    this.progressBar.fill(COLORS.PRIMARY);

    this.progressText.text = `${Math.round(this.progress * 100)}%`;
  }
}
