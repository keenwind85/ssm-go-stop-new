import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Scene } from './Scene';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, FONTS, COIN_CONSTANTS } from '@utils/constants';
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
import { InputModal } from '@ui/InputModal';
import { MenuCard } from '@ui/MenuCard';
import { PlayerProfile } from '@ui/PlayerProfile';

type LobbyView = 'menu' | 'roomList';

// Define layout constants for the new dashboard
const LEFT_PANEL_WIDTH = 400;
const RIGHT_PANEL_X = LEFT_PANEL_WIDTH;
const RIGHT_PANEL_WIDTH = GAME_WIDTH - LEFT_PANEL_WIDTH;


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
  private rightPanel: Container | null = null;
  private mainMenuContainer: Container | null = null;
  private roomListViewContainer: Container | null = null;
  private roomListContainer: Container | null = null;

  // Components
  private playerProfile: PlayerProfile | null = null;
  private joinRoomButton: Button | null = null;
  private backButton: Button | null = null;
  private inputModal: InputModal | null = null;
  private fullscreenButton: Button | null = null;
  private windowedButton: Button | null = null;
  private modalOverlay: Container | null = null;
  
  // State
  private coinWatchUnsubscribe?: () => void;
  private fullscreenChangeHandler: (() => void) | null = null;
  private statusText: Text | null = null;

  constructor(app: Application) {
    super(app);
  }

  async onEnter(): Promise<void> {
    // Require Google login before entering lobby
    try {
      await requireGoogleSignIn('게임을 이용하려면 Google 로그인이 필요합니다.');
    } catch (error) {
      console.error('Google Sign-In failed or cancelled', error);
      // User cancelled or failed to login - return to prevent lobby access
      return;
    }

    this.matchmaking = new Matchmaking();

    // Background
    const bg = new Graphics();
    bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    bg.fill(COLORS.BACKGROUND);
    this.container.addChild(bg);

    // Create Dashboard Panels
    this.createLeftPanel();
    this.createRightPanel();

    // Other UI
    this.createFullscreenButtons();
    this.createStatusDisplay();

    // Show main menu initially
    this.showView('menu');

    this.subscribeToRooms();
    this.subscribeToCoins();
  }
  
  private createLeftPanel(): void {
    this.playerProfile = new PlayerProfile(
        () => this.showAttendanceModal(),
        () => this.showDonationModal(),
        () => this.showRankingModal()
    );
    this.playerProfile.position.set(10, (GAME_HEIGHT - 680) / 2);
    this.container.addChild(this.playerProfile);
  }

  private createRightPanel(): void {
      this.rightPanel = new Container();
      this.rightPanel.position.set(RIGHT_PANEL_X, 0);
      this.container.addChild(this.rightPanel);

      // Create both views within the right panel
      this.createMainMenuView();
      this.createRoomListView();
  }


  onExit(): void {
    this.roomListUnsubscribe?.();
    this.roomWatcherUnsubscribe?.();
    this.coinWatchUnsubscribe?.();
    this.matchmaking?.cleanup();
    this.closeInputModal();
    this.closeModal();

    if (this.fullscreenChangeHandler) {
      document.removeEventListener('fullscreenchange', this.fullscreenChangeHandler);
      this.fullscreenChangeHandler = null;
    }

    this.container.removeChildren();
    // Reset all properties
    Object.assign(this, {
        matchmaking: null,
        rooms: [],
        roomListUnsubscribe: undefined,
        roomWatcherUnsubscribe: undefined,
        selectedRoomId: null,
        isProcessingAction: false,
        isWaitingForApproval: false,
        pendingRoomId: null,
        rightPanel: null,
        mainMenuContainer: null,
        roomListViewContainer: null,
        roomListContainer: null,
        playerProfile: null,
        joinRoomButton: null,
        backButton: null,
        inputModal: null,
        fullscreenButton: null,
        windowedButton: null,
        modalOverlay: null,
        coinWatchUnsubscribe: undefined,
        fullscreenChangeHandler: null,
        statusText: null,
    });
  }

  private showView(view: LobbyView): void {
    if (this.mainMenuContainer) {
      this.mainMenuContainer.visible = view === 'menu';
    }
    if (this.roomListViewContainer) {
      this.roomListViewContainer.visible = view === 'roomList';
    }

    this.setStatus('', false);
    if (view === 'menu') {
      this.selectedRoomId = null;
      this.clearPendingJoinState();
    }
  }

  private createMainMenuView(): void {
    this.mainMenuContainer = new Container();
    this.rightPanel?.addChild(this.mainMenuContainer);

    const centerX = RIGHT_PANEL_WIDTH / 2;

    const title = new Text({
      text: '순시미 맞고',
      style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: 80,
        fontWeight: 'bold',
        fill: COLORS.PRIMARY,
      }),
    });
    title.anchor.set(0.5);
    title.position.set(centerX, 150);
    this.mainMenuContainer.addChild(title);

    const onlineCard = new MenuCard({
        title: '온라인 대전',
        description: '다른 플레이어와 실력을 겨뤄보세요',
        icon: '🆚',
        width: 300,
        height: 300,
        onClick: () => this.showView('roomList'),
    });
    onlineCard.position.set(centerX - 180, GAME_HEIGHT / 2 + 50);
    this.mainMenuContainer.addChild(onlineCard);

    const practiceCard = new MenuCard({
        title: '혼자 연습하기',
        description: 'AI를 상대로 편안하게 연습하세요',
        icon: '🤖',
        width: 300,
        height: 300,
        onClick: () => this.startPracticeMode(),
    });
    practiceCard.position.set(centerX + 180, GAME_HEIGHT / 2 + 50);
    this.mainMenuContainer.addChild(practiceCard);

    const version = new Text({
      text: 'v1.2.0',
      style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: 14,
        fill: COLORS.TEXT_MUTED,
      }),
    });
    version.anchor.set(0.5);
    version.position.set(centerX, GAME_HEIGHT - 30);
    this.mainMenuContainer.addChild(version);
  }

  private createRoomListView(): void {
    this.roomListViewContainer = new Container();
    this.roomListViewContainer.visible = false;
    this.rightPanel?.addChild(this.roomListViewContainer);

    const centerX = RIGHT_PANEL_WIDTH / 2;

    const header = new Text({
      text: '온라인 대전',
      style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: 48,
        fontWeight: 'bold',
        fill: COLORS.TEXT,
      }),
    });
    header.anchor.set(0.5);
    header.position.set(centerX, 120);
    this.roomListViewContainer.addChild(header);

    const panelWidth = RIGHT_PANEL_WIDTH - 100;
    const panelHeight = 350;
    const panelX = (RIGHT_PANEL_WIDTH - panelWidth) / 2;
    const panelY = 180;

    const panel = new Graphics();
    panel.roundRect(panelX, panelY, panelWidth, panelHeight, 16);
    panel.fill({ color: COLORS.SECONDARY, alpha: 0.5 });
    panel.stroke({ width: 2, color: COLORS.PRIMARY, alpha: 0.3 });
    this.roomListViewContainer.addChild(panel);

    this.roomListContainer = new Container();
    this.roomListContainer.position.set(centerX, panelY + panelHeight / 2);
    this.roomListViewContainer.addChild(this.roomListContainer);

    const bottomY = 580;

    this.joinRoomButton = new Button({
      text: '참여하기',
      width: 200,
      height: 60,
      backgroundColor: COLORS.SUCCESS,
      onClick: () => this.handleJoinRoom(),
    });
    this.joinRoomButton.position.set(centerX - 220, bottomY);
    this.joinRoomButton.setDisabled(true);
    this.roomListViewContainer.addChild(this.joinRoomButton);

    const createButton = new Button({
      text: '새 게임방 만들기',
      width: 200,
      height: 60,
      backgroundColor: COLORS.WARNING,
      onClick: () => this.handleCreateRoom(),
    });
    createButton.position.set(centerX, bottomY);
    this.roomListViewContainer.addChild(createButton);
    
    this.backButton = new Button({
      text: '메인으로',
      width: 200,
      height: 60,
      backgroundColor: COLORS.SECONDARY,
      onClick: () => this.showView('menu'),
    });
    this.backButton.position.set(centerX + 220, bottomY);
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
    
    const itemWidth = RIGHT_PANEL_WIDTH - 140;


    if (this.rooms.length === 0) {
      const emptyText = new Text({
        text: '현재 개설된 게임방이 없습니다.\n\n새 게임방을 만들어 다른 플레이어를 기다려보세요!',
        style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 20, fill: COLORS.TEXT_MUTED, align: 'center' }),
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
      bg.roundRect(-itemWidth/2, -itemHeight / 2, itemWidth, itemHeight, 12);
      bg.fill({ color: isSelected ? COLORS.PRIMARY : COLORS.BACKGROUND, alpha: isSelected ? 0.9 : joinable ? 0.7 : 0.4 });
      if (isSelected) bg.stroke({ width: 3, color: COLORS.SUCCESS });
      container.addChild(bg);

      const roomName = new Text({
        text: room.name ?? '이름 없는 방',
        style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 22, fontWeight: 'bold', fill: COLORS.TEXT }),
      });
      roomName.anchor.set(0, 0.5);
      roomName.position.set(-itemWidth/2 + 20, -10);
      container.addChild(roomName);

      const hostName = new Text({
        text: `방장: ${room.hostName ?? '호스트'}`,
        style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 16, fill: COLORS.TEXT_MUTED }),
      });
      hostName.anchor.set(0, 0.5);
      hostName.position.set(-itemWidth/2 + 20, 18);
      container.addChild(hostName);

      const status = new Text({
        text: this.describeRoomStatus(room),
        style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 18, fontWeight: 'bold', fill: joinable ? COLORS.SUCCESS : COLORS.WARNING }),
      });
      status.anchor.set(1, 0.5);
      status.position.set(itemWidth/2 - 20, 0);
      container.addChild(status);

      if (joinable) {
        container.eventMode = 'static';
        container.cursor = 'pointer';
        container.on('pointertap', () => this.selectRoom(room.id));
      }

      listContainer.addChild(container);
      startY += itemHeight + spacing;
    });

    if (this.rooms.length > maxVisible) {
      const moreText = new Text({
        text: `외 ${this.rooms.length - maxVisible}개의 방이 있습니다`,
        style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 14, fill: COLORS.TEXT_MUTED }),
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

    this.joinRoomButton.setText('참여하기');
    const canJoin = !!(this.selectedRoomId && this.rooms.some(room => room.id === this.selectedRoomId && this.canJoinRoom(room)));
    this.joinRoomButton.setDisabled(!canJoin || this.isProcessingAction);
  }

  private canJoinRoom(room: RoomData): boolean {
    return room.status === 'waiting' && !room.joinRequest;
  }

  private describeRoomStatus(room: RoomData): string {
    if (room.joinRequest) return '수락 대기 중';
    if (room.status === 'waiting') return '도전자 대기 중';
    if (room.status === 'playing') return '게임 중';
    return '종료됨';
  }

  private startPracticeMode(): void {
    if (this.isProcessingAction || this.isWaitingForApproval) return;
    this.changeScene('game', { mode: 'ai' });
  }

  private async handleCreateRoom(): Promise<void> {
    if (this.isProcessingAction || this.isWaitingForApproval || !this.matchmaking || this.inputModal) return;
  
    try {
      await requireGoogleSignIn('게임방을 만들려면 Google 로그인이 필요합니다.');
  
      this.inputModal = new InputModal({
        app: this.app,
        title: '게임방 이름 입력',
        defaultValue: '새 게임방',
        onConfirm: async (roomName) => {
          this.closeInputModal();
          if (!roomName) {
            this.setStatus('게임방 생성을 취소했습니다.', false);
            return;
          }
  
          this.isProcessingAction = true;
          this.setStatus('게임방을 생성하는 중...', false);
          try {
            const roomId = await this.matchmaking!.createNamedRoom(roomName);
            this.setStatus('도전자를 기다리는 중 입니다...', false);
            this.changeScene('game', { mode: 'multiplayer', roomId });
          } catch (error) {
            console.error('Failed to create room', error);
            this.setStatus(error instanceof Error ? error.message : '게임방을 만들 수 없습니다.', true);
          } finally {
            this.isProcessingAction = false;
          }
        },
        onCancel: () => {
          this.closeInputModal();
          this.setStatus('게임방 생성을 취소했습니다.', false);
        },
      });
      this.container.addChild(this.inputModal);
  
    } catch (error) {
      console.error('Google Sign-In failed', error);
      this.setStatus(error instanceof Error ? error.message : '로그인이 필요합니다.', true);
    }
  }

  private closeInputModal(): void {
    if (this.inputModal) {
      this.inputModal.destroy();
      this.inputModal = null;
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
      this.setStatus(error instanceof Error ? error.message : '참여 요청을 보낼 수 없습니다.', true);
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
      this.setStatus('요청 취소에 실패했습니다.', true);
    } finally {
      this.clearPendingJoinState();
      this.updateJoinButtonState();
    }
  }

  private watchPendingRoom(roomId: string): void {
    if (!this.matchmaking) return;
    this.roomWatcherUnsubscribe?.();
    this.roomWatcherUnsubscribe = this.matchmaking.watchRoom(roomId, (room) => this.handlePendingRoomUpdate(room, roomId));
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
    if (!request && room.guest !== currentUserId) {
      this.setStatus('방 주인이 요청을 거절했습니다.', true);
      this.clearPendingJoinState();
      this.updateJoinButtonState();
    }
  }

  private clearPendingJoinState(): void {
    this.isWaitingForApproval = false;
    this.pendingRoomId = null;
    this.roomWatcherUnsubscribe?.();
    this.roomWatcherUnsubscribe = undefined;
    this.updateJoinButtonState();
  }

  private async subscribeToCoins(): Promise<void> {
    const userId = getCurrentUserId();
    if (userId) {
        this.coinWatchUnsubscribe = watchUserCoins(userId, (coins) => {
          this.updateCoinDisplay(coins);
        });
    }
    const coins = await getCurrentUserCoins();
    this.updateCoinDisplay(coins);
  }

  private updateCoinDisplay(coins: number): void {
    this.playerProfile?.updateCoins(coins);
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
    panel.roundRect((GAME_WIDTH - modalWidth) / 2, (GAME_HEIGHT - modalHeight) / 2, modalWidth, modalHeight, 16);
    panel.fill(COLORS.SECONDARY);
    panel.stroke({ width: 2, color: COLORS.PRIMARY });
    panel.eventMode = 'static';
    this.modalOverlay.addChild(panel);

    const titleText = new Text({
      text: title,
      style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 28, fontWeight: 'bold', fill: COLORS.TEXT }),
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
    closeBtn.position.set((GAME_WIDTH + modalWidth) / 2 - 50, (GAME_HEIGHT - modalHeight) / 2 + 30);
    this.modalOverlay.addChild(closeBtn);

    const contentContainer = new Container();
    contentContainer.position.set((GAME_WIDTH - modalWidth) / 2 + 30, (GAME_HEIGHT - modalHeight) / 2 + 80);
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
      const errorText = new Text({
        text: '로그인이 필요합니다.',
        style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 18, fill: COLORS.TEXT_MUTED })
      });
      errorText.position.set(150, 150);
      content.addChild(errorText);
      return;
    }

    // 로딩 텍스트
    const loadingText = new Text({
      text: '확인 중...',
      style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 18, fill: COLORS.TEXT_MUTED })
    });
    loadingText.position.set(180, 150);
    content.addChild(loadingText);

    const canClaim = await canClaimAttendance(userId);
    content.removeChild(loadingText);

    // 안내 텍스트
    const infoText = new Text({
      text: `매일 출석 체크로 ${COIN_CONSTANTS.ATTENDANCE_REWARD} 코인을 받을 수 있습니다!`,
      style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 18, fill: COLORS.TEXT, wordWrap: true, wordWrapWidth: 400 })
    });
    infoText.position.set(30, 80);
    content.addChild(infoText);

    if (canClaim) {
      const claimButton = new Button({
        text: '출석 체크하기',
        width: 200,
        height: 50,
        backgroundColor: COLORS.SUCCESS,
        onClick: async () => {
          claimButton.setDisabled(true);
          const result = await claimAttendanceReward();
          if (result.success) {
            this.closeModal();
            this.setStatus(`출석 체크 완료! ${COIN_CONSTANTS.ATTENDANCE_REWARD} 코인을 받았습니다.`, false);
          } else {
            this.setStatus(result.error || '출석 체크에 실패했습니다.', true);
            this.closeModal();
          }
        }
      });
      claimButton.position.set(220, 200);
      content.addChild(claimButton);
    } else {
      const alreadyClaimedText = new Text({
        text: '✅ 오늘은 이미 출석 체크를 완료했습니다.\n내일 다시 방문해주세요!',
        style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 18, fill: COLORS.SUCCESS, align: 'center', wordWrap: true, wordWrapWidth: 400 })
      });
      alreadyClaimedText.position.set(30, 180);
      content.addChild(alreadyClaimedText);
    }
  }

  private async showDonationModal(): Promise<void> {
    const content = this.createModal('🎁 코인 기부');
    const userId = getCurrentUserId();

    if (!userId) {
      const errorText = new Text({
        text: '로그인이 필요합니다.',
        style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 18, fill: COLORS.TEXT_MUTED })
      });
      errorText.position.set(150, 150);
      content.addChild(errorText);
      return;
    }

    // 로딩 텍스트
    const loadingText = new Text({
      text: '불러오는 중...',
      style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 18, fill: COLORS.TEXT_MUTED })
    });
    loadingText.position.set(180, 150);
    content.addChild(loadingText);

    const [canDonate, users] = await Promise.all([
      canDonateToday(userId),
      getAllUsers()
    ]);
    content.removeChild(loadingText);

    // 안내 텍스트
    const infoText = new Text({
      text: `하루에 한 번, ${COIN_CONSTANTS.DONATION_AMOUNT} 코인을 다른 플레이어에게 기부할 수 있습니다.`,
      style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 16, fill: COLORS.TEXT, wordWrap: true, wordWrapWidth: 400 })
    });
    infoText.position.set(30, 60);
    content.addChild(infoText);

    if (!canDonate) {
      const alreadyDonatedText = new Text({
        text: '✅ 오늘은 이미 기부를 완료했습니다.\n내일 다시 방문해주세요!',
        style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 18, fill: COLORS.SUCCESS, align: 'center', wordWrap: true, wordWrapWidth: 400 })
      });
      alreadyDonatedText.position.set(30, 180);
      content.addChild(alreadyDonatedText);
      return;
    }

    if (users.length === 0) {
      const noUsersText = new Text({
        text: '기부할 수 있는 다른 플레이어가 없습니다.',
        style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 18, fill: COLORS.TEXT_MUTED })
      });
      noUsersText.position.set(80, 180);
      content.addChild(noUsersText);
      return;
    }

    // 유저 리스트
    const listContainer = new Container();
    listContainer.position.set(30, 110);
    content.addChild(listContainer);

    const maxVisible = Math.min(users.length, 5);
    const itemHeight = 50;

    for (let i = 0; i < maxVisible; i++) {
      const user = users[i];
      const itemBg = new Graphics();
      itemBg.roundRect(0, i * (itemHeight + 10), 380, itemHeight, 8);
      itemBg.fill({ color: COLORS.BACKGROUND, alpha: 0.5 });
      listContainer.addChild(itemBg);

      const nameText = new Text({
        text: user.name,
        style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 16, fill: COLORS.TEXT })
      });
      nameText.position.set(15, i * (itemHeight + 10) + 15);
      listContainer.addChild(nameText);

      const donateBtn = new Button({
        text: '기부하기',
        width: 100,
        height: 35,
        backgroundColor: COLORS.PRIMARY,
        fontSize: 14,
        onClick: async () => {
          const result = await donateCoins(user.id);
          if (result.success) {
            this.closeModal();
            this.setStatus(`${user.name}님에게 ${COIN_CONSTANTS.DONATION_AMOUNT} 코인을 기부했습니다!`, false);
          } else {
            this.setStatus(result.error || '기부에 실패했습니다.', true);
            this.closeModal();
          }
        }
      });
      donateBtn.position.set(320, i * (itemHeight + 10) + itemHeight / 2);
      listContainer.addChild(donateBtn);
    }

    if (users.length > maxVisible) {
      const moreText = new Text({
        text: `외 ${users.length - maxVisible}명`,
        style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 14, fill: COLORS.TEXT_MUTED })
      });
      moreText.position.set(30, maxVisible * (itemHeight + 10) + 10);
      content.addChild(moreText);
    }
  }

  private async showRankingModal(): Promise<void> {
    const content = this.createModal('🏆 코인 보유 순위');

    // 로딩 텍스트
    const loadingText = new Text({
      text: '순위를 불러오는 중...',
      style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 18, fill: COLORS.TEXT_MUTED })
    });
    loadingText.position.set(150, 180);
    content.addChild(loadingText);

    const rankings = await getCoinRanking();
    content.removeChild(loadingText);

    if (rankings.length === 0) {
      const noDataText = new Text({
        text: '아직 순위 데이터가 없습니다.',
        style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 18, fill: COLORS.TEXT_MUTED })
      });
      noDataText.position.set(130, 180);
      content.addChild(noDataText);
      return;
    }

    // 순위 리스트 헤더
    const headerText = new Text({
      text: '순위          이름                    코인',
      style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 14, fill: COLORS.TEXT_MUTED })
    });
    headerText.position.set(30, 50);
    content.addChild(headerText);

    // 순위 리스트
    const listContainer = new Container();
    listContainer.position.set(30, 80);
    content.addChild(listContainer);

    const maxVisible = Math.min(rankings.length, 10);
    const itemHeight = 35;
    const currentUserId = getCurrentUserId();

    for (let i = 0; i < maxVisible; i++) {
      const ranking = rankings[i];
      const isCurrentUser = ranking.userId === currentUserId;

      const itemBg = new Graphics();
      itemBg.roundRect(0, i * itemHeight, 380, itemHeight - 5, 6);
      itemBg.fill({ color: isCurrentUser ? COLORS.PRIMARY : COLORS.BACKGROUND, alpha: isCurrentUser ? 0.3 : 0.3 });
      listContainer.addChild(itemBg);

      // 순위 메달
      let rankDisplay = `${ranking.rank}`;
      if (ranking.rank === 1) rankDisplay = '🥇';
      else if (ranking.rank === 2) rankDisplay = '🥈';
      else if (ranking.rank === 3) rankDisplay = '🥉';

      const rankText = new Text({
        text: rankDisplay,
        style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 16, fill: COLORS.TEXT })
      });
      rankText.position.set(20, i * itemHeight + 8);
      listContainer.addChild(rankText);

      const nameText = new Text({
        text: ranking.name + (isCurrentUser ? ' (나)' : ''),
        style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 16, fill: isCurrentUser ? COLORS.WARNING : COLORS.TEXT })
      });
      nameText.position.set(80, i * itemHeight + 8);
      listContainer.addChild(nameText);

      const coinText = new Text({
        text: ranking.coins.toLocaleString(),
        style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 16, fill: COLORS.WARNING })
      });
      coinText.anchor.set(1, 0);
      coinText.position.set(370, i * itemHeight + 8);
      listContainer.addChild(coinText);
    }

    if (rankings.length > maxVisible) {
      const moreText = new Text({
        text: `외 ${rankings.length - maxVisible}명의 플레이어`,
        style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 14, fill: COLORS.TEXT_MUTED })
      });
      moreText.position.set(130, maxVisible * itemHeight + 10);
      content.addChild(moreText);
    }
  }

  private createFullscreenButtons(): void {
    this.fullscreenButton = new Button({
      text: '전체화면',
      width: 120,
      height: 40,
      backgroundColor: 0x4a5568,
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
    if (this.fullscreenButton) this.fullscreenButton.visible = !isFullscreen;
    if (this.windowedButton) this.windowedButton.visible = isFullscreen;
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
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch (error) {
      console.warn('창모드 전환에 실패했습니다.', error);
    }
  }

  private createStatusDisplay(): void {
    this.statusText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: FONTS.PRIMARY, fontSize: 18, fill: COLORS.TEXT_MUTED }),
    });
    this.statusText.anchor.set(0.5);
    this.statusText.position.set(LEFT_PANEL_WIDTH + RIGHT_PANEL_WIDTH / 2, GAME_HEIGHT - 60);
    this.container.addChild(this.statusText);
  }

  private setStatus(message: string, isError: boolean): void {
    if (!this.statusText) return;
    this.statusText.text = message;
    this.statusText.style.fill = isError ? COLORS.ERROR : COLORS.TEXT_MUTED;
  }
}
