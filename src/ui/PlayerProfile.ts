import { Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { COLORS, FONTS } from '@utils/constants';
import { Button } from './Button';
import { getUserProfile, getCurrentUserId } from '@fb/auth';

export class PlayerProfile extends Container {
  private avatar: Sprite;
  private nameText: Text;
  private coinText: Text;

  private onShowAttendance: () => void;
  private onShowDonation: () => void;
  private onShowRanking: () => void;

  constructor(
    onShowAttendance: () => void,
    onShowDonation: () => void,
    onShowRanking: () => void,
  ) {
    super();

    this.onShowAttendance = onShowAttendance;
    this.onShowDonation = onShowDonation;
    this.onShowRanking = onShowRanking;

    // Background
    const bg = new Graphics();
    bg.roundRect(0, 0, 380, 680, 16);
    bg.fill({ color: COLORS.SECONDARY, alpha: 0.6 });
    bg.stroke({ width: 2, color: COLORS.PRIMARY, alpha: 0.4 });
    this.addChild(bg);

    // Avatar
    const avatarSize = 120;
    const avatarMask = new Graphics();
    avatarMask.circle(avatarSize / 2, avatarSize / 2, avatarSize / 2);
    avatarMask.position.set((380 - avatarSize) / 2, 40);

    this.avatar = new Sprite(Texture.WHITE);
    this.avatar.width = avatarSize;
    this.avatar.height = avatarSize;
    this.avatar.mask = avatarMask;
    this.avatar.position.set((380 - avatarSize) / 2, 40);
    
    this.addChild(this.avatar);
    this.addChild(avatarMask);


    // Name
    this.nameText = new Text({
        text: '불러오는 중...',
        style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: 32,
        fontWeight: 'bold',
        fill: COLORS.TEXT,
      }),
    });
    this.nameText.anchor.set(0.5);
    this.nameText.position.set(380 / 2, 190);
    this.addChild(this.nameText);

    // Coin Display
    const coinContainer = new Container();
    coinContainer.position.set(380/2, 240);
    this.addChild(coinContainer);
    
    const coinIcon = new Text({text:'💰', style: new TextStyle({fontSize: 28})});
    coinIcon.anchor.set(1, 0.5);
    coinIcon.position.set(-10, 0);
    coinContainer.addChild(coinIcon);

    this.coinText = new Text({
        text: '0',
        style: new TextStyle({
        fontFamily: FONTS.PRIMARY,
        fontSize: 28,
        fontWeight: 'bold',
        fill: COLORS.WARNING,
      }),
    });
    this.coinText.anchor.set(0, 0.5);
    this.coinText.position.set(10, 0);
    coinContainer.addChild(this.coinText);
    
    // Action Buttons
    const buttonY = 320;
    const buttonSpacing = 70;

    const attendanceBtn = new Button({
      text: '🎁 코인 획득하기',
      width: 300,
      height: 60,
      backgroundColor: COLORS.SUCCESS,
      onClick: this.onShowAttendance,
    });
    attendanceBtn.position.set(380/2, buttonY);
    this.addChild(attendanceBtn);
    
    const donationBtn = new Button({
      text: '🎁 코인 기부',
      width: 300,
      height: 60,
      backgroundColor: COLORS.PRIMARY,
      onClick: this.onShowDonation,
    });
    donationBtn.position.set(380/2, buttonY + buttonSpacing);
    this.addChild(donationBtn);

    const rankingBtn = new Button({
      text: '🏆 코인 순위',
      width: 300,
      height: 60,
      backgroundColor: COLORS.WARNING,
      onClick: this.onShowRanking,
    });
    rankingBtn.position.set(380/2, buttonY + buttonSpacing * 2);
    this.addChild(rankingBtn);


    this.loadProfile();
  }
  
  private async loadProfile() {
    const userId = getCurrentUserId();
    if (!userId) {
      this.updateName('게스트');
      return;
    }

    const profile = await getUserProfile(userId);
    if (profile) {
      this.updateName(profile.name);
      // UserData doesn't have avatar field, use default
      this.updateAvatar('');
    } else {
      this.updateName('게스트');
    }
  }

  public updateName(newName: string) {
    this.nameText.text = newName;
  }

  public updateAvatar(avatarUrl: string) {
    if (avatarUrl) {
        this.avatar.texture = Texture.from(avatarUrl);
    } else {
        // You can set a default texture here
        this.avatar.texture = Texture.WHITE;
    }
  }

  public updateCoins(newAmount: number) {
    this.coinText.text = newAmount.toLocaleString();
  }
}
