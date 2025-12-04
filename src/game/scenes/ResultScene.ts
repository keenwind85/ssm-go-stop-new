import { Application, Graphics, Text, TextStyle, Container } from 'pixi.js';
import { Scene } from './Scene';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, FONTS } from '@utils/constants';
import { Button } from '@ui/Button';
import { GameSync } from '@fb/gameSync';
import { getCurrentUserId } from '@fb/auth';
import type { ScoreBreakdown, ContinueGameConsent } from '@utils/types';

interface GameResult {
  winner: 'player' | 'opponent';
  playerScore: number;
  opponentScore: number;
  playerScoreBreakdown?: ScoreBreakdown;
  opponentScoreBreakdown?: ScoreBreakdown;
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
  // Multiplayer specific
  isMultiplayer?: boolean;
  roomId?: string;
  isHost?: boolean;
  winnerId?: string;
  loserId?: string;
  winnerName?: string;
  loserName?: string;
  roundNumber?: number;
}

interface CoinSettlementResult {
  success: boolean;
  winnerCoins: number;
  loserCoins: number;
  transferAmount: number;
  loserBankrupt: boolean;
}

export class ResultScene extends Scene {
  private gameSync: GameSync | null = null;
  private isHost = false;
  private roomId: string | null = null;
  private roundNumber = 1;
  private coinSettlementResult: CoinSettlementResult | null = null;
  private consentContainer: Container | null = null;
  private waitingForConsentText: Text | null = null;
  private hasResponded = false;

  constructor(app: Application) {
    super(app);
  }

  async onEnter(data?: GameResult): Promise<void> {
    // Background
    const bg = new Graphics();
    bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    bg.fill(COLORS.BACKGROUND);
    this.container.addChild(bg);

    // Store multiplayer info
    if (data?.isMultiplayer && data.roomId) {
      this.roomId = data.roomId;
      this.isHost = data.isHost ?? false;
      this.roundNumber = data.roundNumber ?? 1;
      this.gameSync = new GameSync(data.roomId);

      // Setup consent listener
      this.setupConsentListener();
    }

    // Result text
    const isWinner = data?.winner === 'player';
    const resultText = new Text({
      text: isWinner ? '승리!' : '패배',
      style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: 64,
        fontWeight: 'bold',
        fill: isWinner ? COLORS.SUCCESS : COLORS.ERROR,
      }),
    });
    resultText.anchor.set(0.5);
    resultText.position.set(GAME_WIDTH / 2, 120);
    this.container.addChild(resultText);

    // Round number for multiplayer
    if (data?.isMultiplayer) {
      const roundText = new Text({
        text: `${this.roundNumber}회차 게임 종료`,
        style: new TextStyle({
          fontFamily: FONTS.PRIMARY,
          fontSize: 24,
          fill: COLORS.TEXT_MUTED,
        }),
      });
      roundText.anchor.set(0.5);
      roundText.position.set(GAME_WIDTH / 2, 170);
      this.container.addChild(roundText);
    }

    // Score display
    if (data) {
      const scoreText = new Text({
        text: `${data.playerScore} : ${data.opponentScore}`,
        style: new TextStyle({
          fontFamily: FONTS.PRIMARY,
          fontSize: 48,
          fill: COLORS.TEXT,
        }),
      });
      scoreText.anchor.set(0.5);
      scoreText.position.set(GAME_WIDTH / 2, 220);
      this.container.addChild(scoreText);

      // Collected cards summary
      this.createCollectedSummary(data, 280);

      // Handle multiplayer coin settlement
      if (data.isMultiplayer && data.winnerId && data.loserId) {
        await this.handleCoinSettlement(data);
      } else {
        // Single player - just show buttons
        this.createSinglePlayerButtons();
      }
    } else {
      this.createSinglePlayerButtons();
    }
  }

  onExit(): void {
    this.gameSync?.cleanup();
    this.gameSync = null;
    this.consentContainer = null;
    this.waitingForConsentText = null;
    this.hasResponded = false;
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
      const y = startY + index * 35;

      // Label
      const labelText = new Text({
        text: label,
        style: new TextStyle({
          fontFamily: FONTS.PRIMARY,
          fontSize: 18,
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
          fontFamily: FONTS.PRIMARY,
          fontSize: 18,
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
          fontFamily: FONTS.PRIMARY,
          fontSize: 18,
          fill: COLORS.TEXT,
        }),
      });
      opponentText.anchor.set(0.5);
      opponentText.position.set(GAME_WIDTH / 2 + 100, y);
      this.container.addChild(opponentText);
    });
  }

  private async handleCoinSettlement(data: GameResult): Promise<void> {
    if (!this.gameSync || !data.winnerId || !data.loserId) {
      this.createSinglePlayerButtons();
      return;
    }

    const winnerScore = data.winner === 'player'
      ? (data.playerScoreBreakdown?.total ?? data.playerScore)
      : (data.opponentScoreBreakdown?.total ?? data.opponentScore);

    // Only host settles coins
    if (this.isHost) {
      try {
        this.coinSettlementResult = await this.gameSync.settleCoins(
          data.winnerId,
          data.loserId,
          winnerScore
        );
      } catch (error) {
        console.error('Failed to settle coins:', error);
        this.coinSettlementResult = null;
      }
    }

    // Display coin settlement result
    this.displayCoinSettlement(data);
  }

  private displayCoinSettlement(data: GameResult): void {
    const startY = 440;
    const currentUserId = getCurrentUserId();
    const isCurrentUserWinner = data.winnerId === currentUserId;

    // Coin settlement header
    const coinHeader = new Text({
      text: '💰 코인 정산',
      style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: 24,
        fontWeight: 'bold',
        fill: COLORS.WARNING,
      }),
    });
    coinHeader.anchor.set(0.5);
    coinHeader.position.set(GAME_WIDTH / 2, startY);
    this.container.addChild(coinHeader);

    // Get score for coin calculation
    const winnerScore = data.winner === 'player'
      ? (data.playerScoreBreakdown?.total ?? data.playerScore)
      : (data.opponentScoreBreakdown?.total ?? data.opponentScore);

    // Display coin transfer info
    const coinMessage = isCurrentUserWinner
      ? `+${winnerScore} 코인 획득!`
      : `-${winnerScore} 코인 소진`;

    const coinText = new Text({
      text: coinMessage,
      style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: 32,
        fontWeight: 'bold',
        fill: isCurrentUserWinner ? COLORS.SUCCESS : COLORS.ERROR,
      }),
    });
    coinText.anchor.set(0.5);
    coinText.position.set(GAME_WIDTH / 2, startY + 45);
    this.container.addChild(coinText);

    // Check for bankruptcy
    if (this.coinSettlementResult?.loserBankrupt) {
      const bankruptText = new Text({
        text: '참여 유저의 코인이 모두 소진되어\n더 이상 게임 진행이 불가능합니다.',
        style: new TextStyle({
          fontFamily: FONTS.PRIMARY,
          fontSize: 18,
          fill: COLORS.ERROR,
          align: 'center',
        }),
      });
      bankruptText.anchor.set(0.5);
      bankruptText.position.set(GAME_WIDTH / 2, startY + 100);
      this.container.addChild(bankruptText);

      // Only show lobby button if bankrupt
      this.createLobbyOnlyButton();
    } else {
      // Show continue game consent UI
      this.showContinueGameConsent();
    }
  }

  private showContinueGameConsent(): void {
    const startY = 530;

    this.consentContainer = new Container();
    this.consentContainer.position.set(GAME_WIDTH / 2, startY);
    this.container.addChild(this.consentContainer);

    // Consent prompt
    const promptText = new Text({
      text: `${this.roundNumber}회차 게임이 종료되었습니다.\n연속으로 게임을 진행할까요?`,
      style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: 20,
        fill: COLORS.TEXT,
        align: 'center',
      }),
    });
    promptText.anchor.set(0.5);
    promptText.position.set(0, 0);
    this.consentContainer.addChild(promptText);

    // Yes button
    const yesButton = new Button({
      text: '예',
      width: 150,
      height: 50,
      backgroundColor: COLORS.SUCCESS,
      textColor: COLORS.TEXT,
      onClick: () => this.handleConsentResponse(true),
    });
    yesButton.position.set(-90, 70);
    this.consentContainer.addChild(yesButton);

    // No button
    const noButton = new Button({
      text: '아니오',
      width: 150,
      height: 50,
      backgroundColor: COLORS.ERROR,
      textColor: COLORS.TEXT,
      onClick: () => this.handleConsentResponse(false),
    });
    noButton.position.set(90, 70);
    this.consentContainer.addChild(noButton);

    // Waiting text (hidden initially)
    this.waitingForConsentText = new Text({
      text: '상대방의 응답을 기다리는 중...',
      style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: 18,
        fill: COLORS.TEXT_MUTED,
      }),
    });
    this.waitingForConsentText.anchor.set(0.5);
    this.waitingForConsentText.position.set(0, 130);
    this.waitingForConsentText.visible = false;
    this.consentContainer.addChild(this.waitingForConsentText);

    // Request consent from Firebase (host initiates)
    if (this.isHost && this.gameSync) {
      this.gameSync.requestContinueGame(this.roundNumber + 1);
    }
  }

  private async handleConsentResponse(consent: boolean): Promise<void> {
    if (!this.gameSync || this.hasResponded) return;

    this.hasResponded = true;

    try {
      await this.gameSync.respondContinueGame(this.isHost, consent);

      if (!consent) {
        // If declined, show message and go to lobby
        this.showDeclinedMessage();
      } else {
        // Show waiting for opponent
        if (this.waitingForConsentText) {
          this.waitingForConsentText.visible = true;
        }
        // Hide buttons
        if (this.consentContainer) {
          this.consentContainer.children.forEach(child => {
            if (child instanceof Button) {
              child.visible = false;
            }
          });
        }
      }
    } catch (error) {
      console.error('Failed to respond to consent:', error);
    }
  }

  private setupConsentListener(): void {
    if (!this.gameSync) return;

    this.gameSync.onContinueConsentChange((consent: ContinueGameConsent | null) => {
      if (!consent) return;

      const hostConsent = consent.hostConsent;
      const guestConsent = consent.guestConsent;

      // Check if both have responded
      if (hostConsent !== undefined && guestConsent !== undefined) {
        if (hostConsent && guestConsent) {
          // Both agreed - start new round
          this.startNewRound(consent.roundNumber);
        } else {
          // At least one declined
          this.showDeclinedMessage();
        }
      } else if (
        (this.isHost && guestConsent === false) ||
        (!this.isHost && hostConsent === false)
      ) {
        // Opponent declined
        this.showDeclinedMessage();
      }
    });
  }

  private async startNewRound(roundNumber: number): Promise<void> {
    if (!this.gameSync || !this.roomId) {
      this.changeScene('lobby');
      return;
    }

    // Host starts the new round
    if (this.isHost) {
      try {
        await this.gameSync.startNewRound(roundNumber);
      } catch (error) {
        console.error('Failed to start new round:', error);
        this.changeScene('lobby');
        return;
      }
    }

    // Navigate back to game scene
    this.changeScene('game', { mode: 'multiplayer', roomId: this.roomId });
  }

  private showDeclinedMessage(): void {
    // Clear consent container
    if (this.consentContainer) {
      this.consentContainer.removeChildren();

      const declinedText = new Text({
        text: '게임 유저가 동의하지 않아\n현재 게임방은 종료됩니다.',
        style: new TextStyle({
          fontFamily: FONTS.PRIMARY,
          fontSize: 20,
          fill: COLORS.WARNING,
          align: 'center',
        }),
      });
      declinedText.anchor.set(0.5);
      declinedText.position.set(0, 0);
      this.consentContainer.addChild(declinedText);

      // Close room if host
      if (this.isHost && this.gameSync) {
        this.gameSync.closeRoom('consent_declined');
      }

      // Add lobby button
      const lobbyButton = new Button({
        text: '로비로 돌아가기',
        width: 200,
        height: 50,
        backgroundColor: COLORS.PRIMARY,
        textColor: COLORS.TEXT,
        onClick: () => this.changeScene('lobby'),
      });
      lobbyButton.position.set(0, 70);
      this.consentContainer.addChild(lobbyButton);
    }
  }

  private createSinglePlayerButtons(): void {
    // Play again button
    const playAgainButton = new Button({
      text: '다시 하기',
      width: 200,
      height: 50,
      backgroundColor: COLORS.PRIMARY,
      textColor: COLORS.TEXT,
      onClick: () => this.handlePlayAgain(),
    });
    playAgainButton.position.set(GAME_WIDTH / 2, GAME_HEIGHT - 150);
    this.container.addChild(playAgainButton);

    // Lobby button
    const lobbyButton = new Button({
      text: '로비로',
      width: 200,
      height: 50,
      backgroundColor: COLORS.SECONDARY,
      textColor: COLORS.TEXT,
      onClick: () => this.handleGoToLobby(),
    });
    lobbyButton.position.set(GAME_WIDTH / 2, GAME_HEIGHT - 80);
    this.container.addChild(lobbyButton);
  }

  private createLobbyOnlyButton(): void {
    const lobbyButton = new Button({
      text: '로비로 돌아가기',
      width: 200,
      height: 50,
      backgroundColor: COLORS.PRIMARY,
      textColor: COLORS.TEXT,
      onClick: () => {
        // Close room if host
        if (this.isHost && this.gameSync) {
          this.gameSync.closeRoom('bankruptcy');
        }
        this.changeScene('lobby');
      },
    });
    lobbyButton.position.set(GAME_WIDTH / 2, GAME_HEIGHT - 100);
    this.container.addChild(lobbyButton);
  }

  private handlePlayAgain(): void {
    this.changeScene('game', { mode: 'ai' });
  }

  private handleGoToLobby(): void {
    this.changeScene('lobby');
  }
}
