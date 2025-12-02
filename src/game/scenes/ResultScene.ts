import { Application, Graphics, Text, TextStyle } from 'pixi.js';
import { Scene } from './Scene';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '@utils/constants';
import { Button } from '@ui/Button';

interface GameResult {
  winner: 'player' | 'opponent';
  playerScore: number;
  opponentScore: number;
  playerCollected: {
    kwang: number;
    animal: number;
    ribbon: number;
    pi: number;
  };
  opponentCollected: {
    kwang: number;
    animal: number;
    ribbon: number;
    pi: number;
  };
}

export class ResultScene extends Scene {
  constructor(app: Application) {
    super(app);
  }

  async onEnter(data?: GameResult): Promise<void> {
    // Background
    const bg = new Graphics();
    bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    bg.fill(COLORS.BACKGROUND);
    this.container.addChild(bg);

    // Result text
    const isWinner = data?.winner === 'player';
    const resultText = new Text({
      text: isWinner ? '승리!' : '패배',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 64,
        fontWeight: 'bold',
        fill: isWinner ? COLORS.SUCCESS : COLORS.ERROR,
      }),
    });
    resultText.anchor.set(0.5);
    resultText.position.set(GAME_WIDTH / 2, 200);
    this.container.addChild(resultText);

    // Score display
    if (data) {
      const scoreText = new Text({
        text: `${data.playerScore} : ${data.opponentScore}`,
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 48,
          fill: COLORS.TEXT,
        }),
      });
      scoreText.anchor.set(0.5);
      scoreText.position.set(GAME_WIDTH / 2, 300);
      this.container.addChild(scoreText);

      // Collected cards summary
      this.createCollectedSummary(data, 400);
    }

    // Buttons
    const playAgainButton = new Button({
      text: '다시 하기',
      width: 200,
      height: 50,
      backgroundColor: COLORS.PRIMARY,
      textColor: COLORS.TEXT,
      onClick: () => this.handlePlayAgain(),
    });
    playAgainButton.position.set(GAME_WIDTH / 2, GAME_HEIGHT - 200);
    this.container.addChild(playAgainButton);

    const lobbyButton = new Button({
      text: '로비로',
      width: 200,
      height: 50,
      backgroundColor: COLORS.SECONDARY,
      textColor: COLORS.TEXT,
      onClick: () => this.handleGoToLobby(),
    });
    lobbyButton.position.set(GAME_WIDTH / 2, GAME_HEIGHT - 130);
    this.container.addChild(lobbyButton);
  }

  onExit(): void {
    this.container.removeChildren();
  }

  private createCollectedSummary(data: GameResult, startY: number): void {
    const labels = ['광', '열끗', '띠', '피'];
    const playerValues = [
      data.playerCollected.kwang,
      data.playerCollected.animal,
      data.playerCollected.ribbon,
      data.playerCollected.pi,
    ];
    const opponentValues = [
      data.opponentCollected.kwang,
      data.opponentCollected.animal,
      data.opponentCollected.ribbon,
      data.opponentCollected.pi,
    ];

    labels.forEach((label, index) => {
      const y = startY + index * 40;

      // Label
      const labelText = new Text({
        text: label,
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 20,
          fill: COLORS.TEXT_MUTED,
        }),
      });
      labelText.anchor.set(0.5);
      labelText.position.set(GAME_WIDTH / 2, y);
      this.container.addChild(labelText);

      // Player value
      const playerText = new Text({
        text: playerValues[index].toString(),
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 20,
          fill: COLORS.TEXT,
        }),
      });
      playerText.anchor.set(0.5);
      playerText.position.set(GAME_WIDTH / 2 - 100, y);
      this.container.addChild(playerText);

      // Opponent value
      const opponentText = new Text({
        text: opponentValues[index].toString(),
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 20,
          fill: COLORS.TEXT,
        }),
      });
      opponentText.anchor.set(0.5);
      opponentText.position.set(GAME_WIDTH / 2 + 100, y);
      this.container.addChild(opponentText);
    });
  }

  private handlePlayAgain(): void {
    // TODO: Start new game
    console.log('Play again');
  }

  private handleGoToLobby(): void {
    // TODO: Go to lobby
    console.log('Go to lobby');
  }
}
