import { useEffect } from 'react';

/**
 * Publishes how much of the screen the software keyboard is covering.
 *
 * A position:fixed element on iOS is laid out against the layout viewport and
 * is NOT moved when the keyboard opens. A bottom sheet anchored to bottom:0
 * therefore stays exactly where it was, underneath the keyboard, and because
 * its scroll region extends below the visible area there is nowhere to scroll
 * to - the form is unreachable. That is the whole problem this solves; the
 * height cap alone cannot fix it.
 *
 * Two custom properties are published on the root element:
 *   --kb  how many pixels the keyboard covers, for lifting the sheet
 *   --vvh the height actually visible right now, for capping the sheet
 *
 * The viewport meta's interactive-widget=resizes-content does this natively,
 * but only on Chromium. iOS Safari ignores it, and this app is used on iPhones.
 */
export function useVisualViewportInsets() {
  useEffect(() => {
    const root = document.documentElement;

    const update = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      // What is hidden below the visible area: the keyboard, plus anything
      // scrolled out of view above. Never negative - a rubber-band overscroll
      // reports a viewport taller than the layout viewport, and a negative
      // inset would push the sheet up off screen.
      const covered = window.innerHeight - (vv.height + vv.offsetTop);
      const kb = Math.max(0, Math.round(covered));
      root.style.setProperty('--kb', `${kb}px`);
      root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    };

    const vv = window.visualViewport;
    update();
    if (!vv) return;

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    // The keyboard animates in and out; scroll fires on some iOS versions when
    // only the height changed, so both are needed.
    window.addEventListener('orientationchange', update);

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
}