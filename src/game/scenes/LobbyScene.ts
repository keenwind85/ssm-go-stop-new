import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Scene } from './Scene';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, COIN_CONSTANTS } from '@utils/constants';
import { Button } from '@ui/Button';
import { Matchmaking } from '@fb/matchmaking';
import { requireGoogleSignIn } from '@ui/AuthOverlay';
import { RoomData } from '@utils/types';
import { getCurrentUserId } from '@fb/auth';
import {
  getCurrentUserCoins,
  watchUserCoins,
  claimAttendanceReward,
  canClaimAttendance,
  getCoinRanking,
  getAllUsers,
  donateCoins,
  canDonateToday,
} from '@fb/coinService';

type LobbyView = 'menu' | 'roomList';

export class LobbyScene extends Scene {
  private matchmaking: Matchmaking | null = null;
  private rooms: RoomData[] = [];
  private roomListUnsubscribe?: () => void;
  private roomWatcherUnsubscribe?: () => void;
  private selectedRoomId: string | null = null;
  private isProcessingAction = false;
  private isWaitingForApproval = false;
  private pendingRoomId: string | null = null;

  // View management
  private mainMenuContainer: Container | null = null;
  private roomListViewContainer: Container | null = null;
  private roomListContainer: Container | null = null;

  // Buttons
  private joinRoomButton: Button | null = null;
  private backButton: Button | null = null;

  // Fullscreen toggle buttons
  private fullscreenButton: Button | null = null;
  private windowedButton: Button | null = null;
  private fullscreenChangeHandler: (() => void) | null = null;

  // Coin system
  private coinDisplay: Text | null = null;
  private coinWatchUnsubscribe?: () => void;
  private coinMenuContainer: Container | null = null;
  private modalOverlay: Container | null = null;

  // Status
  private statusText: Text | null = null;

  constructor(app: Application) {
    super(app);
  }

  async onEnter(): Promise<void> {
    this.matchmaking = new Matchmaking();

    // Background
    const bg = new Graphics();
    bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    bg.fill(COLORS.BACKGROUND);
    this.container.addChild(bg);

    this.createCoinDisplay();
    this.createCoinMenuButtons();
    this.createFullscreenButtons();
    this.createStatusDisplay();

    // Create both views
    this.createMainMenuView();
    this.createRoomListView();

    // Show main menu initially
    this.showView('menu');

    this.subscribeToRooms();
    this.subscribeToCoins();
  }

  onExit(): void {
    this.roomListUnsubscribe?.();
    this.roomWatcherUnsubscribe?.();
    this.coinWatchUnsubscribe?.();
    this.matchmaking?.cleanup();

    if (this.fullscreenChangeHandler) {
      document.removeEventListener('fullscreenchange', this.fullscreenChangeHandler);
      this.fullscreenChangeHandler = null;
    }

    this.mainMenuContainer = null;
    this.roomListViewContainer = null;
    this.roomListContainer = null;
    this.joinRoomButton = null;
    this.backButton = null;
    this.fullscreenButton = null;
    this.windowedButton = null;
    this.coinMenuContainer = null;
    this.modalOverlay = null;
    this.coinDisplay = null;
    this.statusText = null;

    this.rooms = [];
    this.selectedRoomId = null;
    this.isProcessingAction = false;
    this.isWaitingForApproval = false;
    this.pendingRoomId = null;

    this.container.removeChildren();
  }

  private showView(view: LobbyView): void {
    if (this.mainMenuContainer) {
      this.mainMenuContainer.visible = view === 'menu';
    }
    if (this.roomListViewContainer) {
      this.roomListViewContainer.visible = view === 'roomList';
    }

    // Clear status when switching views
    this.setStatus('', false);

    // Reset selection when going back to menu
    if (view === 'menu') {
      this.selectedRoomId = null;
      this.clearPendingJoinState();
    }
  }

  private createMainMenuView(): void {
    this.mainMenuContainer = new Container();
    this.container.addChild(this.mainMenuContainer);

    // Title
    const title = new Text({
      text: '고스톱',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 80,
        fontWeight: 'bold',
        fill: COLORS.PRIMARY,
      }),
    });
    title.anchor.set(0.5);
    title.position.set(GAME_WIDTH / 2, 200);
    this.mainMenuContainer.addChild(title);

    // Buttons container
    const buttonsY = 380;
    const buttonSpacing = 90;

    // 게임방 참여하기 button
    const joinButton = new Button({
      text: '게임방 참여하기',
      width: 320,
      height: 70,
      backgroundColor: COLORS.PRIMARY,
      textColor: COLORS.TEXT,
      fontSize: 24,
      onClick: () => this.showView('roomList'),
    });
    joinButton.position.set(GAME_WIDTH / 2, buttonsY);
    this.mainMenuContainer.addChild(joinButton);

    // 게임방 새로 만들기 button
    const createButton = new Button({
      text: '게임방 새로 만들기',
      width: 320,
      height: 70,
      backgroundColor: COLORS.WARNING,
      textColor: COLORS.TEXT,
      fontSize: 24,
      onClick: () => this.handleCreateRoom(),
    });
    createButton.position.set(GAME_WIDTH / 2, buttonsY + buttonSpacing);
    this.mainMenuContainer.addChild(createButton);

    // 혼자 연습하기 button
    const practiceButton = new Button({
      text: '혼자 연습하기',
      width: 320,
      height: 70,
      backgroundColor: COLORS.SECONDARY,
      textColor: COLORS.TEXT,
      fontSize: 24,
      onClick: () => this.startPracticeMode(),
    });
    practiceButton.position.set(GAME_WIDTH / 2, buttonsY + buttonSpacing * 2);
    this.mainMenuContainer.addChild(practiceButton);

    // Version
    const version = new Text({
      text: 'v1.0.0',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 14,
        fill: COLORS.TEXT_MUTED,
      }),
    });
    version.anchor.set(0.5);
    version.position.set(GAME_WIDTH / 2, GAME_HEIGHT - 30);
    this.mainMenuContainer.addChild(version);
  }

  private createRoomListView(): void {
    this.roomListViewContainer = new Container();
    this.roomListViewContainer.visible = false;
    this.container.addChild(this.roomListViewContainer);

    // Header
    const header = new Text({
      text: '게임방 목록',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 36,
        fontWeight: 'bold',
        fill: COLORS.TEXT,
      }),
    });
    header.anchor.set(0.5);
    header.position.set(GAME_WIDTH / 2, 140);
    this.roomListViewContainer.addChild(header);

    // Room list panel
    const panelWidth = GAME_WIDTH - 200;
    const panelHeight = 380;
    const panelX = (GAME_WIDTH - panelWidth) / 2;
    const panelY = 180;

    const panel = new Graphics();
    panel.roundRect(panelX, panelY, panelWidth, panelHeight, 16);
    panel.fill({ color: COLORS.SECONDARY, alpha: 0.5 });
    panel.stroke({ width: 2, color: COLORS.PRIMARY, alpha: 0.3 });
    this.roomListViewContainer.addChild(panel);

    // Room list container
    this.roomListContainer = new Container();
    this.roomListContainer.position.set(GAME_WIDTH / 2, panelY + panelHeight / 2);
    this.roomListViewContainer.addChild(this.roomListContainer);

    // Bottom buttons
    const bottomY = 600;

    // 참여 button
    this.joinRoomButton = new Button({
      text: '참여',
      width: 200,
      height: 60,
      backgroundColor: COLORS.SUCCESS,
      textColor: COLORS.TEXT,
      fontSize: 22,
      onClick: () => this.handleJoinRoom(),
    });
    this.joinRoomButton.position.set(GAME_WIDTH / 2 - 120, bottomY);
    this.joinRoomButton.setDisabled(true);
    this.roomListViewContainer.addChild(this.joinRoomButton);

    // 이전 button
    this.backButton = new Button({
      text: '이전',
      width: 200,
      height: 60,
      backgroundColor: COLORS.SECONDARY,
      textColor: COLORS.TEXT,
      fontSize: 22,
      onClick: () => this.showView('menu'),
    });
    this.backButton.position.set(GAME_WIDTH / 2 + 120, bottomY);
    this.roomListViewContainer.addChild(this.backButton);
  }

  private subscribeToRooms(): void {
    if (!this.matchmaking) return;
    this.roomListUnsubscribe = this.matchmaking.watchAvailableRooms((rooms) => {
      this.rooms = rooms;

      if (this.selectedRoomId && !rooms.some(room => room.id === this.selectedRoomId && this.canJoinRoom(room))) {
        this.selectedRoomId = null;
      }

      this.renderRoomList();
      this.updateJoinButtonState();
    });
  }

  private renderRoomList(): void {
    const listContainer = this.roomListContainer;
    if (!listContainer) return;
    listContainer.removeChildren();

    if (this.rooms.length === 0) {
      const emptyText = new Text({
        text: '현재 개설된 게임방이 없습니다.\n\n게임방을 직접 만들어보세요!',
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 20,
          fill: COLORS.TEXT_MUTED,
          align: 'center',
        }),
      });
      emptyText.anchor.set(0.5);
      listContainer.addChild(emptyText);
      return;
    }

    const itemHeight = 70;
    const spacing = 10;
    const maxVisible = 4;
    const visibleRooms = this.rooms.slice(0, maxVisible);
    const totalHeight = visibleRooms.length * itemHeight + (visibleRooms.length - 1) * spacing;
    let startY = -totalHeight / 2 + itemHeight / 2;

    visibleRooms.forEach((room) => {
      const isSelected = this.selectedRoomId === room.id;
      const joinable = this.canJoinRoom(room) && !this.isProcessingAction && !this.isWaitingForApproval;
      const container = new Container();
      container.position.set(0, startY);

      const bg = new Graphics();
      bg.roundRect(-450, -itemHeight / 2, 900, itemHeight, 12);
      const baseColor = isSelected ? COLORS.PRIMARY : COLORS.BACKGROUND;
      const alpha = isSelected ? 0.9 : joinable ? 0.7 : 0.4;
      bg.fill({ color: baseColor, alpha });
      if (isSelected) {
        bg.stroke({ width: 3, color: COLORS.SUCCESS });
      }
      container.addChild(bg);

      const roomName = new Text({
        text: room.name ?? '이름 없는 방',
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 22,
          fontWeight: 'bold',
          fill: COLORS.TEXT,
        }),
      });
      roomName.anchor.set(0, 0.5);
      roomName.position.set(-420, -10);
      container.addChild(roomName);

      const hostName = new Text({
        text: `방장: ${room.hostName ?? '호스트'}`,
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 16,
          fill: COLORS.TEXT_MUTED,
        }),
      });
      hostName.anchor.set(0, 0.5);
      hostName.position.set(-420, 18);
      container.addChild(hostName);

      const status = new Text({
        text: this.describeRoomStatus(room),
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 18,
          fontWeight: 'bold',
          fill: joinable ? COLORS.SUCCESS : COLORS.WARNING,
        }),
      });
      status.anchor.set(1, 0.5);
      status.position.set(420, 0);
      container.addChild(status);

      if (joinable) {
        container.eventMode = 'static';
        container.cursor = 'pointer';
        container.on('pointertap', () => this.selectRoom(room.id));
      }

      listContainer.addChild(container);
      startY += itemHeight + spacing;
    });

    // Show count if more rooms
    if (this.rooms.length > maxVisible) {
      const moreText = new Text({
        text: `외 ${this.rooms.length - maxVisible}개의 방이 있습니다`,
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 14,
          fill: COLORS.TEXT_MUTED,
        }),
      });
      moreText.anchor.set(0.5);
      moreText.position.set(0, startY + 10);
      listContainer.addChild(moreText);
    }
  }

  private selectRoom(roomId: string): void {
    if (this.isWaitingForApproval) return;
    this.selectedRoomId = roomId;
    this.renderRoomList();
    this.updateJoinButtonState();
  }

  private updateJoinButtonState(): void {
    if (!this.joinRoomButton) return;

    if (this.isWaitingForApproval) {
      this.joinRoomButton.setText('요청 취소');
      this.joinRoomButton.setDisabled(false);
      return;
    }

    this.joinRoomButton.setText('참여');
    const canJoin = Boolean(this.selectedRoomId && this.rooms.some(room => room.id === this.selectedRoomId && this.canJoinRoom(room)));
    this.joinRoomButton.setDisabled(!canJoin || this.isProcessingAction);
  }

  private canJoinRoom(room: RoomData): boolean {
    return room.status === 'waiting' && !room.joinRequest;
  }

  private describeRoomStatus(room: RoomData): string {
    if (room.joinRequest) {
      return '수락 대기 중';
    }
    if (room.status === 'waiting') {
      return '도전자 대기 중';
    }
    if (room.status === 'playing') {
      return '게임 중';
    }
    return '종료됨';
  }

  private startPracticeMode(): void {
    if (this.isProcessingAction || this.isWaitingForApproval) return;
    this.changeScene('game', { mode: 'ai' });
  }

  private async handleCreateRoom(): Promise<void> {
    if (this.isProcessingAction || this.isWaitingForApproval || !this.matchmaking) return;

    this.isProcessingAction = true;
    this.setStatus('게임방을 생성하는 중...', false);

    try {
      await requireGoogleSignIn('게임방을 만들려면 Google 로그인이 필요합니다.');
      const defaultName = '새 게임방';
      const input = window.prompt('게임방 이름을 입력하세요', defaultName);
      const roomName = input?.trim();

      if (!roomName) {
        this.setStatus('게임방 생성을 취소했습니다.', false);
        return;
      }

      const roomId = await this.matchmaking.createNamedRoom(roomName);
      this.setStatus('도전자를 기다리는 중 입니다...', false);
      this.changeScene('game', { mode: 'multiplayer', roomId });
    } catch (error) {
      console.error('Failed to create room', error);
      const errorMessage = error instanceof Error ? error.message : '게임방을 만들 수 없습니다. 잠시 후 다시 시도해주세요.';
      this.setStatus(errorMessage, true);
    } finally {
      this.isProcessingAction = false;
    }
  }

  private async handleJoinRoom(): Promise<void> {
    if (this.isWaitingForApproval) {
      await this.cancelJoinRequest();
      return;
    }

    if (!this.selectedRoomId) return;
    await this.requestJoinSelectedRoom(this.selectedRoomId);
  }

  private async requestJoinSelectedRoom(roomId: string): Promise<void> {
    if (!this.matchmaking || this.isProcessingAction) return;

    const room = this.rooms.find(r => r.id === roomId);
    if (!room || !this.canJoinRoom(room)) {
      this.setStatus('다른 도전자가 이미 대기 중입니다.', true);
      this.updateJoinButtonState();
      return;
    }

    this.isProcessingAction = true;
    this.joinRoomButton?.setDisabled(true);
    this.setStatus('게임방 참여 요청을 보내는 중...', false);

    try {
      await requireGoogleSignIn('멀티 플레이를 이용하려면 Google 로그인이 필요합니다.');
      await this.matchmaking.requestJoinRoom(roomId);

      this.pendingRoomId = roomId;
      this.isWaitingForApproval = true;
      this.watchPendingRoom(roomId);
      this.setStatus('게임방 주인의 수락을 기다리는 중입니다...', false);
    } catch (error) {
      console.error('Failed to request room join', error);
      const errorMessage = error instanceof Error ? error.message : '참여 요청을 보낼 수 없습니다. 잠시 후 다시 시도해주세요.';
      this.setStatus(errorMessage, true);
    } finally {
      this.isProcessingAction = false;
      this.updateJoinButtonState();
    }
  }

  private async cancelJoinRequest(): Promise<void> {
    if (!this.matchmaking || !this.pendingRoomId) return;

    this.setStatus('참여 요청을 취소하는 중...', false);
    try {
      await this.matchmaking.cancelJoinRequest(this.pendingRoomId);
      this.setStatus('참여 요청을 취소했습니다.', false);
    } catch (error) {
      console.error('Failed to cancel join request', error);
      this.setStatus('요청 취소에 실패했습니다. 잠시 후 다시 시도해주세요.', true);
    } finally {
      this.clearPendingJoinState();
      this.updateJoinButtonState();
    }
  }

  private watchPendingRoom(roomId: string): void {
    if (!this.matchmaking) return;
    this.roomWatcherUnsubscribe?.();
    this.roomWatcherUnsubscribe = this.matchmaking.watchRoom(roomId, (room) => {
      this.handlePendingRoomUpdate(room, roomId);
    });
    this.updateJoinButtonState();
  }

  private handlePendingRoomUpdate(room: RoomData | null, roomId: string): void {
    if (!this.isWaitingForApproval || roomId !== this.pendingRoomId) return;

    const currentUserId = getCurrentUserId();
    if (!currentUserId) return;

    if (!room) {
      this.setStatus('게임방이 닫혔습니다.', true);
      this.clearPendingJoinState();
      this.updateJoinButtonState();
      return;
    }

    if (room.status === 'playing' && room.guest === currentUserId) {
      this.setStatus('게임방에 입장합니다...', false);
      this.changeScene('game', { mode: 'multiplayer', roomId });
      return;
    }

    const request = room.joinRequest;
    const wasRejected = !request && room.guest !== currentUserId;

    if (wasRejected) {
      this.setStatus('방 주인이 요청을 거절했습니다.', true);
      this.clearPendingJoinState();
      this.updateJoinButtonState();
      return;
    }
  }

  private clearPendingJoinState(): void {
    this.isWaitingForApproval = false;
    this.pendingRoomId = null;
    this.roomWatcherUnsubscribe?.();
    this.roomWatcherUnsubscribe = undefined;
    this.updateJoinButtonState();
  }

  // ========== Coin System ==========

  private createCoinDisplay(): void {
    const coinContainer = new Container();
    coinContainer.position.set(30, 30);
    this.container.addChild(coinContainer);

    const coinIcon = new Text({
      text: '💰',
      style: new TextStyle({
        fontSize: 28,
      }),
    });
    coinIcon.anchor.set(0, 0.5);
    coinIcon.position.set(0, 0);
    coinContainer.addChild(coinIcon);

    this.coinDisplay = new Text({
      text: '0 코인',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 22,
        fontWeight: 'bold',
        fill: COLORS.WARNING,
      }),
    });
    this.coinDisplay.anchor.set(0, 0.5);
    this.coinDisplay.position.set(40, 0);
    coinContainer.addChild(this.coinDisplay);

    this.loadCoinBalance();
  }

  private async loadCoinBalance(): Promise<void> {
    const coins = await getCurrentUserCoins();
    this.updateCoinDisplay(coins);
  }

  private subscribeToCoins(): void {
    const userId = getCurrentUserId();
    if (!userId) return;
    this.coinWatchUnsubscribe = watchUserCoins(userId, (coins) => {
      this.updateCoinDisplay(coins);
    });
  }

  private updateCoinDisplay(coins: number): void {
    if (this.coinDisplay) {
      this.coinDisplay.text = `${coins.toLocaleString()} 코인`;
    }
  }

  private createCoinMenuButtons(): void {
    this.coinMenuContainer = new Container();
    this.coinMenuContainer.position.set(30, 80);
    this.container.addChild(this.coinMenuContainer);

    const attendanceBtn = new Button({
      text: '🎁 코인 획득하기',
      width: 160,
      height: 40,
      backgroundColor: COLORS.SUCCESS,
      textColor: COLORS.TEXT,
      fontSize: 14,
      onClick: () => this.showAttendanceModal(),
    });
    attendanceBtn.position.set(80, 0);
    this.coinMenuContainer.addChild(attendanceBtn);

    const donationBtn = new Button({
      text: '🎁 코인 기부',
      width: 130,
      height: 40,
      backgroundColor: COLORS.PRIMARY,
      textColor: COLORS.TEXT,
      fontSize: 14,
      onClick: () => this.showDonationModal(),
    });
    donationBtn.position.set(230, 0);
    this.coinMenuContainer.addChild(donationBtn);

    const rankingBtn = new Button({
      text: '🏆 코인 순위',
      width: 130,
      height: 40,
      backgroundColor: COLORS.WARNING,
      textColor: COLORS.TEXT,
      fontSize: 14,
      onClick: () => this.showRankingModal(),
    });
    rankingBtn.position.set(380, 0);
    this.coinMenuContainer.addChild(rankingBtn);
  }

  private createModal(title: string): Container {
    this.closeModal();

    this.modalOverlay = new Container();
    this.modalOverlay.zIndex = 1000;
    this.container.addChild(this.modalOverlay);

    const overlay = new Graphics();
    overlay.rect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    overlay.fill({ color: 0x000000, alpha: 0.7 });
    overlay.eventMode = 'static';
    overlay.on('pointertap', () => this.closeModal());
    this.modalOverlay.addChild(overlay);

    const modalWidth = 500;
    const modalHeight = 500;
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
    panel.eventMode = 'static';
    this.modalOverlay.addChild(panel);

    const titleText = new Text({
      text: title,
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 28,
        fontWeight: 'bold',
        fill: COLORS.TEXT,
      }),
    });
    titleText.anchor.set(0.5);
    titleText.position.set(GAME_WIDTH / 2, (GAME_HEIGHT - modalHeight) / 2 + 40);
    this.modalOverlay.addChild(titleText);

    const closeBtn = new Button({
      text: '✕',
      width: 40,
      height: 40,
      backgroundColor: COLORS.ERROR,
      textColor: COLORS.TEXT,
      fontSize: 20,
      onClick: () => this.closeModal(),
    });
    closeBtn.position.set(
      (GAME_WIDTH + modalWidth) / 2 - 50,
      (GAME_HEIGHT - modalHeight) / 2 + 30
    );
    this.modalOverlay.addChild(closeBtn);

    const contentContainer = new Container();
    contentContainer.position.set(
      (GAME_WIDTH - modalWidth) / 2 + 30,
      (GAME_HEIGHT - modalHeight) / 2 + 80
    );
    this.modalOverlay.addChild(contentContainer);

    return contentContainer;
  }

  private closeModal(): void {
    if (this.modalOverlay) {
      this.modalOverlay.destroy({ children: true });
      this.modalOverlay = null;
    }
  }

  private async showAttendanceModal(): Promise<void> {
    const content = this.createModal('🎁 코인 획득하기');
    const userId = getCurrentUserId();

    if (!userId) {
      const loginText = new Text({
        text: '로그인이 필요합니다.',
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 18,
          fill: COLORS.TEXT_MUTED,
        }),
      });
      loginText.position.set(150, 100);
      content.addChild(loginText);
      return;
    }

    const canClaim = await canClaimAttendance(userId);

    const descText = new Text({
      text: `매일 출석 체크를 하면 ${COIN_CONSTANTS.ATTENDANCE_REWARD}코인을 받을 수 있습니다!\n\n출석 체크는 매일 00:00에 초기화됩니다.`,
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 18,
        fill: COLORS.TEXT,
        wordWrap: true,
        wordWrapWidth: 420,
        lineHeight: 28,
      }),
    });
    descText.position.set(20, 30);
    content.addChild(descText);

    if (canClaim) {
      const claimBtn = new Button({
        text: `출석 체크하고 ${COIN_CONSTANTS.ATTENDANCE_REWARD}코인 받기!`,
        width: 300,
        height: 60,
        backgroundColor: COLORS.SUCCESS,
        textColor: COLORS.TEXT,
        fontSize: 18,
        onClick: async () => {
          const result = await claimAttendanceReward();
          if (result.success) {
            this.setStatus(`출석 체크 완료! ${COIN_CONSTANTS.ATTENDANCE_REWARD}코인을 받았습니다.`, false);
            this.closeModal();
          } else {
            this.setStatus(result.error ?? '출석 체크에 실패했습니다.', true);
          }
        },
      });
      claimBtn.position.set(90, 180);
      content.addChild(claimBtn);
    } else {
      const alreadyClaimedText = new Text({
        text: '✅ 오늘은 이미 출석 체크를 완료했습니다!\n\n내일 다시 방문해주세요.',
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 20,
          fill: COLORS.SUCCESS,
          align: 'center',
          wordWrap: true,
          wordWrapWidth: 400,
          lineHeight: 30,
        }),
      });
      alreadyClaimedText.position.set(60, 180);
      content.addChild(alreadyClaimedText);
    }
  }

  private async showDonationModal(): Promise<void> {
    const content = this.createModal('🎁 코인 기부');
    const userId = getCurrentUserId();

    if (!userId) {
      const loginText = new Text({
        text: '로그인이 필요합니다.',
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 18,
          fill: COLORS.TEXT_MUTED,
        }),
      });
      loginText.position.set(150, 100);
      content.addChild(loginText);
      return;
    }

    const canDonate = await canDonateToday(userId);

    if (!canDonate) {
      const alreadyDonatedText = new Text({
        text: '✅ 오늘은 이미 기부를 완료했습니다!\n\n기부는 하루에 1회만 가능합니다.\n내일 다시 방문해주세요.',
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 18,
          fill: COLORS.SUCCESS,
          align: 'center',
          wordWrap: true,
          wordWrapWidth: 400,
          lineHeight: 28,
        }),
      });
      alreadyDonatedText.position.set(50, 100);
      content.addChild(alreadyDonatedText);
      return;
    }

    const descText = new Text({
      text: `다른 플레이어에게 ${COIN_CONSTANTS.DONATION_AMOUNT}코인을 기부할 수 있습니다.\n(하루 1회 제한)`,
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 16,
        fill: COLORS.TEXT_MUTED,
        wordWrap: true,
        wordWrapWidth: 420,
      }),
    });
    descText.position.set(20, 20);
    content.addChild(descText);

    const users = await getAllUsers();

    if (users.length === 0) {
      const noUsersText = new Text({
        text: '기부할 수 있는 사용자가 없습니다.',
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 18,
          fill: COLORS.TEXT_MUTED,
        }),
      });
      noUsersText.position.set(100, 150);
      content.addChild(noUsersText);
      return;
    }

    const listContainer = new Container();
    listContainer.position.set(0, 70);
    content.addChild(listContainer);

    const itemHeight = 50;
    let startY = 0;

    users.slice(0, 20).forEach((user) => {
      const itemContainer = new Container();
      itemContainer.position.set(0, startY);

      const bg = new Graphics();
      bg.roundRect(0, 0, 420, itemHeight - 5, 8);
      bg.fill({ color: COLORS.BACKGROUND, alpha: 0.5 });
      itemContainer.addChild(bg);

      const nameText = new Text({
        text: user.name,
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 16,
          fill: COLORS.TEXT,
        }),
      });
      nameText.anchor.set(0, 0.5);
      nameText.position.set(15, itemHeight / 2 - 2);
      itemContainer.addChild(nameText);

      const coinsText = new Text({
        text: `${user.coins.toLocaleString()} 코인`,
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 14,
          fill: COLORS.WARNING,
        }),
      });
      coinsText.anchor.set(0, 0.5);
      coinsText.position.set(180, itemHeight / 2 - 2);
      itemContainer.addChild(coinsText);

      const donateBtn = new Button({
        text: '기부하기',
        width: 90,
        height: 35,
        backgroundColor: COLORS.SUCCESS,
        textColor: COLORS.TEXT,
        fontSize: 14,
        onClick: async () => {
          const result = await donateCoins(user.id);
          if (result.success) {
            this.setStatus(`${user.name}님에게 ${COIN_CONSTANTS.DONATION_AMOUNT}코인을 기부했습니다!`, false);
            this.closeModal();
          } else {
            this.setStatus(result.error ?? '기부에 실패했습니다.', true);
          }
        },
      });
      donateBtn.position.set(360, itemHeight / 2 - 2);
      itemContainer.addChild(donateBtn);

      listContainer.addChild(itemContainer);
      startY += itemHeight;
    });
  }

  private async showRankingModal(): Promise<void> {
    const content = this.createModal('🏆 코인 보유 순위');

    const loadingText = new Text({
      text: '순위를 불러오는 중...',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 18,
        fill: COLORS.TEXT_MUTED,
      }),
    });
    loadingText.position.set(150, 150);
    content.addChild(loadingText);

    const rankings = await getCoinRanking();
    content.removeChild(loadingText);

    if (rankings.length === 0) {
      const noDataText = new Text({
        text: '순위 정보가 없습니다.',
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 18,
          fill: COLORS.TEXT_MUTED,
        }),
      });
      noDataText.position.set(150, 150);
      content.addChild(noDataText);
      return;
    }

    const descText = new Text({
      text: `코인 보유량 상위 ${Math.min(rankings.length, COIN_CONSTANTS.RANKING_LIMIT)}명`,
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 16,
        fill: COLORS.TEXT_MUTED,
      }),
    });
    descText.position.set(140, 10);
    content.addChild(descText);

    const listContainer = new Container();
    listContainer.position.set(0, 50);
    content.addChild(listContainer);

    const itemHeight = 45;
    let startY = 0;
    const currentUserId = getCurrentUserId();

    rankings.slice(0, 8).forEach((ranking) => {
      const itemContainer = new Container();
      itemContainer.position.set(0, startY);

      const isCurrentUser = ranking.userId === currentUserId;
      const bg = new Graphics();
      bg.roundRect(0, 0, 420, itemHeight - 5, 8);
      bg.fill({ color: isCurrentUser ? COLORS.PRIMARY : COLORS.BACKGROUND, alpha: isCurrentUser ? 0.3 : 0.5 });
      itemContainer.addChild(bg);

      let rankDisplay: string;
      let rankColor: number;
      if (ranking.rank === 1) {
        rankDisplay = '🥇';
        rankColor = 0xffd700;
      } else if (ranking.rank === 2) {
        rankDisplay = '🥈';
        rankColor = 0xc0c0c0;
      } else if (ranking.rank === 3) {
        rankDisplay = '🥉';
        rankColor = 0xcd7f32;
      } else {
        rankDisplay = `${ranking.rank}`;
        rankColor = COLORS.TEXT_MUTED;
      }

      const rankText = new Text({
        text: rankDisplay,
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: ranking.rank <= 3 ? 24 : 18,
          fontWeight: 'bold',
          fill: rankColor,
        }),
      });
      rankText.anchor.set(0.5, 0.5);
      rankText.position.set(30, itemHeight / 2 - 2);
      itemContainer.addChild(rankText);

      const nameText = new Text({
        text: ranking.name + (isCurrentUser ? ' (나)' : ''),
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 16,
          fontWeight: isCurrentUser ? 'bold' : 'normal',
          fill: COLORS.TEXT,
        }),
      });
      nameText.anchor.set(0, 0.5);
      nameText.position.set(60, itemHeight / 2 - 2);
      itemContainer.addChild(nameText);

      const coinsText = new Text({
        text: `${ranking.coins.toLocaleString()} 코인`,
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 16,
          fontWeight: 'bold',
          fill: COLORS.WARNING,
        }),
      });
      coinsText.anchor.set(1, 0.5);
      coinsText.position.set(400, itemHeight / 2 - 2);
      itemContainer.addChild(coinsText);

      listContainer.addChild(itemContainer);
      startY += itemHeight;
    });
  }

  // ========== Fullscreen ==========

  private createFullscreenButtons(): void {
    this.fullscreenButton = new Button({
      text: '전체화면',
      width: 120,
      height: 40,
      backgroundColor: 0x4a5568,
      textColor: COLORS.TEXT,
      fontSize: 16,
      onClick: () => this.enterFullscreen(),
    });
    this.fullscreenButton.position.set(GAME_WIDTH - 80, 40);
    this.container.addChild(this.fullscreenButton);

    this.windowedButton = new Button({
      text: '창모드',
      width: 120,
      height: 40,
      backgroundColor: 0x4a5568,
      textColor: COLORS.TEXT,
      fontSize: 16,
      onClick: () => this.exitFullscreen(),
    });
    this.windowedButton.position.set(GAME_WIDTH - 80, 40);
    this.container.addChild(this.windowedButton);

    this.updateFullscreenButtons();

    this.fullscreenChangeHandler = () => this.updateFullscreenButtons();
    document.addEventListener('fullscreenchange', this.fullscreenChangeHandler);
  }

  private updateFullscreenButtons(): void {
    const isFullscreen = !!document.fullscreenElement;

    if (this.fullscreenButton) {
      this.fullscreenButton.visible = !isFullscreen;
    }
    if (this.windowedButton) {
      this.windowedButton.visible = isFullscreen;
    }
  }

  private async enterFullscreen(): Promise<void> {
    try {
      await document.documentElement.requestFullscreen();
    } catch (error) {
      console.warn('전체화면 모드를 지원하지 않는 브라우저입니다.', error);
    }
  }

  private async exitFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.warn('창모드 전환에 실패했습니다.', error);
    }
  }

  // ========== Status ==========

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
    this.statusText.position.set(GAME_WIDTH / 2, GAME_HEIGHT - 60);
    this.container.addChild(this.statusText);
  }

  private setStatus(message: string, isError: boolean): void {
    if (!this.statusText) return;
    this.statusText.text = message;
    this.statusText.style.fill = isError ? COLORS.ERROR : COLORS.TEXT_MUTED;
  }
}
