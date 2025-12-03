/**
 * PWA 설치 안내 유틸리티
 * iOS와 Android 모두 지원
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

class PWAInstallManager {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private isIOS: boolean;
  private isAndroid: boolean;
  private isStandalone: boolean;
  private hasShownPrompt: boolean;

  constructor() {
    this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    this.isAndroid = /Android/.test(navigator.userAgent);
    this.isStandalone = this.checkStandalone();
    this.hasShownPrompt = localStorage.getItem('pwa-prompt-shown') === 'true';

    this.init();
  }

  private checkStandalone(): boolean {
    // iOS Safari standalone mode
    if ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone) {
      return true;
    }

    // Android/Desktop PWA mode
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return true;
    }

    // iOS Safari fullscreen mode
    if (window.matchMedia('(display-mode: fullscreen)').matches) {
      return true;
    }

    return false;
  }

  private init(): void {
    // Android: beforeinstallprompt 이벤트 캡처
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      console.log('[PWA] beforeinstallprompt event captured');
    });

    // 설치 완료 감지
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App was installed');
      this.deferredPrompt = null;
      this.hidePrompt();
      localStorage.setItem('pwa-installed', 'true');
    });
  }

  /**
   * 설치 안내 표시 여부 확인
   */
  shouldShowPrompt(): boolean {
    // 이미 PWA로 실행 중이면 표시 안 함
    if (this.isStandalone) {
      console.log('[PWA] Already running in standalone mode');
      return false;
    }

    // 이미 설치됨으로 기록되어 있으면 표시 안 함
    if (localStorage.getItem('pwa-installed') === 'true') {
      console.log('[PWA] Already installed (from localStorage)');
      return false;
    }

    // 이미 프롬프트를 표시했으면 표시 안 함
    if (this.hasShownPrompt) {
      console.log('[PWA] Prompt already shown before');
      return false;
    }

    // 모바일 기기만 대상
    if (!this.isIOS && !this.isAndroid) {
      console.log('[PWA] Not a mobile device');
      return false;
    }

    return true;
  }

  /**
   * 설치 안내 팝업 표시
   */
  showPrompt(): void {
    if (!this.shouldShowPrompt()) return;

    const overlay = document.getElementById('pwa-install-overlay');
    if (!overlay) return;

    // iOS/Android에 맞는 안내 표시
    const iosGuide = document.getElementById('pwa-ios-guide');
    const androidGuide = document.getElementById('pwa-android-guide');

    if (this.isIOS && iosGuide) {
      iosGuide.style.display = 'block';
    }
    if (this.isAndroid && androidGuide) {
      androidGuide.style.display = 'block';
    }

    overlay.classList.remove('hidden');

    // 표시 기록
    localStorage.setItem('pwa-prompt-shown', 'true');
    this.hasShownPrompt = true;
  }

  /**
   * 안내 팝업 숨기기
   */
  hidePrompt(): void {
    const overlay = document.getElementById('pwa-install-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
  }

  /**
   * Android 설치 실행 (beforeinstallprompt 사용)
   */
  async installAndroid(): Promise<boolean> {
    if (!this.deferredPrompt) {
      console.log('[PWA] No deferred prompt available');
      return false;
    }

    try {
      await this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      console.log('[PWA] User choice:', outcome);

      this.deferredPrompt = null;

      if (outcome === 'accepted') {
        localStorage.setItem('pwa-installed', 'true');
        this.hidePrompt();
        return true;
      }
    } catch (error) {
      console.error('[PWA] Install error:', error);
    }

    return false;
  }

  /**
   * Android에서 네이티브 설치 가능 여부
   */
  canInstallNatively(): boolean {
    return this.isAndroid && this.deferredPrompt !== null;
  }

  /**
   * 기기 타입 반환
   */
  getDeviceType(): 'ios' | 'android' | 'other' {
    if (this.isIOS) return 'ios';
    if (this.isAndroid) return 'android';
    return 'other';
  }

  /**
   * 프롬프트 표시 기록 초기화 (테스트용)
   */
  resetPromptHistory(): void {
    localStorage.removeItem('pwa-prompt-shown');
    localStorage.removeItem('pwa-installed');
    this.hasShownPrompt = false;
    console.log('[PWA] Prompt history reset');
  }
}

// 싱글톤 인스턴스
export const pwaInstallManager = new PWAInstallManager();
