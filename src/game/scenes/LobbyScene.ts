import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Scene } from './Scene';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '@utils/constants';
import { Button } from '@ui/Button';
import { Matchmaking } from '@fb/matchmaking';
import { requireGoogleSignIn } from '@ui/AuthOverlay';
import { RoomData } from '@utils/types';
import { getCurrentUserId } from '@fb/auth';

export class LobbyScene extends Scene {
  private practiceButton: Button | null = null;
  private createRoomButton: Button | null = null;
  private joinRoomButton: Button | null = null;
  private statusText: Text | null = null;
  private roomListContainer: Container | null = null;
  private matchmaking: Matchmaking | null = null;
  private rooms: RoomData[] = [];
  private roomListUnsubscribe?: () => void;
  private roomWatcherUnsubscribe?: () => void;
  private selectedRoomId: string | null = null;
  private isProcessingAction = false;
  private isWaitingForApproval = false;
  private pendingRoomId: string | null = null;

  // Fullscreen toggle buttons
  private fullscreenButton: Button | null = null;
  private windowedButton: Button | null = null;
  private fullscreenChangeHandler: (() => void) | null = null;

  constructor(app: Application) {
    super(app);
  }

  async onEnter(): Promise<void> {
    this.matchmaking = new Matchmaking();
    this.createLayout();
    this.createRoomListPanel();
    this.createButtons();
    this.createFullscreenButtons();
    this.createStatusDisplay();
    this.subscribeToRooms();
  }

  onExit(): void {
    this.roomListUnsubscribe?.();
    this.roomWatcherUnsubscribe?.();
    this.matchmaking?.cleanup();

    // Remove fullscreen change listener
    if (this.fullscreenChangeHandler) {
      document.removeEventListener('fullscreenchange', this.fullscreenChangeHandler);
      this.fullscreenChangeHandler = null;
    }

    this.practiceButton?.destroy();
    this.createRoomButton?.destroy();
    this.joinRoomButton?.destroy();
    this.fullscreenButton?.destroy();
    this.windowedButton?.destroy();
    this.roomListContainer?.destroy({ children: true });

    this.practiceButton = null;
    this.createRoomButton = null;
    this.joinRoomButton = null;
    this.fullscreenButton = null;
    this.windowedButton = null;
    this.roomListContainer = null;
    this.statusText = null;

    this.rooms = [];
    this.selectedRoomId = null;
    this.isProcessingAction = false;
    this.isWaitingForApproval = false;
    this.pendingRoomId = null;

    this.container.removeChildren();
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
    title.position.set(GAME_WIDTH / 2, 160);
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
    subtitle.position.set(GAME_WIDTH / 2, 220);
    this.container.addChild(subtitle);
  }

  private createRoomListPanel(): void {
    const panel = new Graphics();
    panel.roundRect(140, 260, GAME_WIDTH - 280, 320, 24);
    panel.fill({ color: COLORS.SECONDARY, alpha: 0.7 });
    panel.stroke({ width: 3, color: COLORS.PRIMARY, alpha: 0.4 });
    this.container.addChild(panel);

    const header = new Text({
      text: '개설된 게임방',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 24,
        fontWeight: 'bold',
        fill: COLORS.TEXT,
      }),
    });
    header.anchor.set(0, 0.5);
    header.position.set(180, 290);
    this.container.addChild(header);

    this.roomListContainer = new Container();
    this.roomListContainer.position.set(GAME_WIDTH / 2, 420);
    this.container.addChild(this.roomListContainer);
  }

  private createButtons(): void {
    const practiceButton = new Button({
      text: '연습하기',
      width: 280,
      height: 64,
      backgroundColor: COLORS.SECONDARY,
      textColor: COLORS.TEXT,
      onClick: () => this.startPracticeMode(),
    });
    practiceButton.position.set(GAME_WIDTH / 2 - 200, 620);
    this.container.addChild(practiceButton);
    this.practiceButton = practiceButton;

    const createRoomButton = new Button({
      text: '게임방 새로 만들기',
      width: 300,
      height: 70,
      backgroundColor: COLORS.PRIMARY,
      textColor: COLORS.TEXT,
      onClick: () => this.handleCreateRoom(),
    });
    createRoomButton.position.set(GAME_WIDTH / 2 + 220, 320);
    this.container.addChild(createRoomButton);
    this.createRoomButton = createRoomButton;

    const joinRoomButton = new Button({
      text: '게임방 참여하기',
      width: 300,
      height: 70,
      backgroundColor: COLORS.WARNING,
      textColor: COLORS.TEXT,
      onClick: () => this.handleJoinRoomAction(),
    });
    joinRoomButton.position.set(GAME_WIDTH / 2 + 220, 420);
    joinRoomButton.setDisabled(true);
    this.container.addChild(joinRoomButton);
    this.joinRoomButton = joinRoomButton;

    const version = new Text({
      text: 'v1.0.0',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 14,
        fill: COLORS.TEXT_MUTED,
      }),
    });
    version.anchor.set(0.5);
    version.position.set(GAME_WIDTH / 2, GAME_HEIGHT - 40);
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
    this.statusText.position.set(GAME_WIDTH / 2, 700);
    this.container.addChild(this.statusText);
  }

  private createFullscreenButtons(): void {
    // 전체화면 버튼
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

    // 창모드 버튼
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

    // 현재 상태에 따라 버튼 표시/숨김
    this.updateFullscreenButtons();

    // fullscreenchange 이벤트 리스너 등록
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

  private renderRoomList(): void {
    const listContainer = this.roomListContainer;
    if (!listContainer) return;
    listContainer.removeChildren();

    if (this.rooms.length === 0) {
      const emptyText = new Text({
        text: '현재 개설된 게임방이 없습니다. "게임방 새로 만들기" 버튼으로 방을 만들어보세요.',
        style: new TextStyle({
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 18,
          fill: COLORS.TEXT_MUTED,
        }),
      });
      emptyText.anchor.set(0.5);
      listContainer.addChild(emptyText);
      return;
    }

    const itemHeight = 70;
    const spacing = 12;
    const totalHeight = this.rooms.length * itemHeight + (this.rooms.length - 1) * spacing;
    let startY = -totalHeight / 2 + itemHeight / 2;

    this.rooms.forEach((room) => {
      const isSelected = this.selectedRoomId === room.id;
      const joinable = this.canJoinRoom(room) && !this.isProcessingAction && !this.isWaitingForApproval;
      const container = new Container();
      container.position.set(0, startY);

      const bg = new Graphics();
      bg.roundRect(-380, -itemHeight / 2, 760, itemHeight, 14);
      const baseColor = isSelected ? COLORS.PRIMARY : COLORS.SECONDARY;
      const alpha = isSelected ? 0.85 : joinable ? 0.6 : 0.35;
      bg.fill({ color: baseColor, alpha });
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
      roomName.position.set(-350, 0);
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
      hostName.position.set(-350, 24);
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
      status.position.set(360, 0);
      container.addChild(status);

      if (joinable) {
        container.eventMode = 'static';
        container.cursor = 'pointer';
        container.on('pointertap', () => this.selectRoom(room.id));
      }

      listContainer.addChild(container);
      startY += itemHeight + spacing;
    });
  }

  private selectRoom(roomId: string): void {
    if (this.isWaitingForApproval) return;
    if (this.selectedRoomId === roomId) return;
    this.selectedRoomId = roomId;
    this.renderRoomList();
    this.updateJoinButtonState();
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
    this.createRoomButton?.setDisabled(true);
    this.joinRoomButton?.setDisabled(true);
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
      this.setStatus('게임방을 만들 수 없습니다. 잠시 후 다시 시도해주세요.', true);
    } finally {
      this.isProcessingAction = false;
      this.createRoomButton?.setDisabled(false);
      this.updateJoinButtonState();
    }
  }

  private async handleJoinRoomAction(): Promise<void> {
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
      this.setStatus('참여 요청을 보낼 수 없습니다. 잠시 후 다시 시도해주세요.', true);
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

    // 방이 삭제된 경우
    if (!room) {
      this.setStatus('게임방이 닫혔습니다.', true);
      this.clearPendingJoinState();
      this.updateJoinButtonState();
      return;
    }

    // 호스트가 수락하여 게임이 시작된 경우 → 게임 씬으로 이동
    if (room.status === 'playing' && room.guest === currentUserId) {
      this.setStatus('게임방에 입장합니다...', false);
      this.changeScene('game', { mode: 'multiplayer', roomId });
      return;
    }

    // 호스트가 거절한 경우: joinRequest가 null이고, 내가 guest가 아닌 경우
    const request = room.joinRequest;
    const wasRejected = !request && room.guest !== currentUserId;

    if (wasRejected) {
      this.setStatus('방 주인이 요청을 거절했습니다.', true);
      this.clearPendingJoinState();
      this.updateJoinButtonState();
      return;
    }

    // 아직 대기 중인 경우 (joinRequest가 존재하고 내 요청인 경우)
    // → 아무것도 하지 않고 계속 대기
  }

  private clearPendingJoinState(): void {
    this.isWaitingForApproval = false;
    this.pendingRoomId = null;
    this.roomWatcherUnsubscribe?.();
    this.roomWatcherUnsubscribe = undefined;
    this.updateJoinButtonState();
  }

  private updateJoinButtonState(): void {
    if (!this.joinRoomButton) return;

    if (this.isWaitingForApproval) {
      this.joinRoomButton.setText('요청 취소');
      this.joinRoomButton.setDisabled(false);
      return;
    }

    this.joinRoomButton.setText('게임방 참여하기');
    const canJoin = Boolean(this.selectedRoomId && this.rooms.some(room => room.id === this.selectedRoomId && this.canJoinRoom(room)));
    this.joinRoomButton.setDisabled(!canJoin || this.isProcessingAction);
  }

  private setStatus(message: string, isError: boolean): void {
    if (!this.statusText) return;
    this.statusText.text = message;
    this.statusText.style.fill = isError ? COLORS.ERROR : COLORS.TEXT_MUTED;
  }
}
