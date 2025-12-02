import { Application, Graphics, Text, TextStyle } from 'pixi.js';
import { Scene } from './Scene';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '@utils/constants';
import { Button } from '@ui/Button';
import { Matchmaking } from '@fb/matchmaking';
import { requireGoogleSignIn } from '@ui/AuthOverlay';

export class LobbyScene extends Scene {
  private practiceButton: Button | null = null;
  private multiplayerButton: Button | null = null;
  private statusText: Text | null = null;
  private isMatchmaking: boolean = false;

  constructor(app: Application) {
    super(app);
  }

  async onEnter(): Promise<void> {
    this.createLayout();
    this.createButtons();
    this.createStatusDisplay();
  }

  onExit(): void {
    this.practiceButton?.destroy();
    this.multiplayerButton?.destroy();
    this.statusText = null;
    this.practiceButton = null;
    this.multiplayerButton = null;
    this.container.removeChildren();
  }

  private createLayout(): void {
    const bg = new Graphics();
    bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    bg.fill(COLORS.BACKGROUND);
    this.container.addChild(bg);

    const title = new Text({
      text: '고스톱',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 64,
        fontWeight: 'bold',
        fill: COLORS.PRIMARY,
      }),
    });
    title.anchor.set(0.5);
    title.position.set(GAME_WIDTH / 2, 200);
    this.container.addChild(title);

    const subtitle = new Text({
      text: '연습 또는 멀티 플레이를 선택하세요',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 20,
        fill: COLORS.TEXT_MUTED,
      }),
    });
    subtitle.anchor.set(0.5);
    subtitle.position.set(GAME_WIDTH / 2, 270);
    this.container.addChild(subtitle);
  }

  private createButtons(): void {
    const practiceButton = new Button({
      text: '연습하기',
      width: 300,
      height: 70,
      backgroundColor: COLORS.SECONDARY,
      textColor: COLORS.TEXT,
      onClick: () => this.startPracticeMode(),
    });
    practiceButton.position.set(GAME_WIDTH / 2, 420);
    this.container.addChild(practiceButton);
    this.practiceButton = practiceButton;

    const multiplayerButton = new Button({
      text: '멀티 플레이',
      width: 300,
      height: 70,
      backgroundColor: COLORS.PRIMARY,
      textColor: COLORS.TEXT,
      onClick: () => this.startMultiplayerMode(),
    });
    multiplayerButton.position.set(GAME_WIDTH / 2, 520);
    this.container.addChild(multiplayerButton);
    this.multiplayerButton = multiplayerButton;

    const version = new Text({
      text: 'v1.0.0',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 14,
        fill: COLORS.TEXT_MUTED,
      }),
    });
    version.anchor.set(0.5);
    version.position.set(GAME_WIDTH / 2, GAME_HEIGHT - 50);
    this.container.addChild(version);
  }

  private createStatusDisplay(): void {
    this.statusText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 18,
        fill: COLORS.TEXT_MUTED,
      }),
    });
    this.statusText.anchor.set(0.5);
    this.statusText.position.set(GAME_WIDTH / 2, 610);
    this.container.addChild(this.statusText);
  }

  private startPracticeMode(): void {
    if (this.isMatchmaking) return;
    this.changeScene('game', { mode: 'ai' });
  }

  private async startMultiplayerMode(): Promise<void> {
    if (this.isMatchmaking) return;

    this.isMatchmaking = true;
    this.setStatus('Google 로그인 확인 중...', false);
    this.multiplayerButton?.setDisabled(true);

    try {
      await requireGoogleSignIn('멀티 플레이를 이용하려면 Google 로그인이 필요합니다.');
      this.setStatus('상대를 찾는 중...', false);

      const matchmaking = new Matchmaking();
      const roomId = await matchmaking.findMatch();

      this.setStatus('매칭 완료! 게임을 불러오는 중...', false);
      this.changeScene('game', { mode: 'multiplayer', roomId });
    } catch (error) {
      console.error('Failed to start multiplayer', error);
      this.setStatus('멀티 플레이를 시작할 수 없습니다. 다시 시도해주세요.', true);
      this.multiplayerButton?.setDisabled(false);
      this.isMatchmaking = false;
    }
  }

  private setStatus(message: string, isError: boolean): void {
    if (!this.statusText) return;
    this.statusText.text = message;
    this.statusText.style.fill = isError ? COLORS.ERROR : COLORS.TEXT_MUTED;
  }
}
