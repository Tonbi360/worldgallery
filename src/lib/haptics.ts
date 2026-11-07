/**
 * Haptic Feedback Utility for Web & PWA
 * 
 * Provides a resilient wrapper around the Web Vibration API (`navigator.vibrate`)
 * modeled after iOS UIImpactFeedbackGenerator, UISelectionFeedbackGenerator,
 * and UINotificationFeedbackGenerator.
 */

type ImpactStyle = 'light' | 'medium' | 'heavy';
type NotificationType = 'success' | 'warning' | 'error';

class HapticsManager {
  private isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'navigator' in window &&
      typeof navigator.vibrate === 'function'
    );
  }

  private vibrate(pattern: number | number[]): boolean {
    if (!this.isSupported()) return false;
    try {
      return navigator.vibrate(pattern);
    } catch {
      // Gracefully fail silently if permissions or device restrictions prevent vibration
      return false;
    }
  }

  /**
   * Selection tick: Ultra-light, short tick (6ms)
   * Ideal for:
   * - A-Z alphabet scrubber dragging
   * - Segmented control / tab index changes
   * - Wheel pickers
   */
  public selection(): boolean {
    return this.vibrate(6);
  }

  /**
   * Impact feedback: Physical collision feedback
   * @param style 'light' | 'medium' | 'heavy'
   * Ideal for:
   * - Button clicks / presses ('light')
   * - Card taps & modal presentations ('medium')
   * - Swipe dismissals & destructive confirmations ('heavy')
   */
  public impact(style: ImpactStyle = 'light'): boolean {
    switch (style) {
      case 'light':
        return this.vibrate(10);
      case 'medium':
        return this.vibrate(22);
      case 'heavy':
        return this.vibrate(38);
      default:
        return this.vibrate(10);
    }
  }

  /**
   * Notification feedback: Multi-burst pattern for task outcomes
   * @param type 'success' | 'warning' | 'error'
   * Ideal for:
   * - Connection request sent / approved ('success')
   * - Daily 10-approval cap reached ('warning')
   * - Form validation error / connection declined ('error')
   */
  public notification(type: NotificationType): boolean {
    switch (type) {
      case 'success':
        // Double pulse: quick tick followed by slightly stronger confirm
        return this.vibrate([12, 40, 20]);
      case 'warning':
        // Slower pulse pair
        return this.vibrate([25, 50, 25]);
      case 'error':
        // Triple urgent buzz
        return this.vibrate([35, 45, 35, 45, 40]);
      default:
        return this.vibrate(15);
    }
  }
}

export const haptics = new HapticsManager();
export default haptics;
