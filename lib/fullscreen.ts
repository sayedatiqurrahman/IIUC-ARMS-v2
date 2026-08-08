export function isFullscreen(): boolean {
  return typeof document !== 'undefined' && !!document.fullscreenElement;
}

export async function toggleFullscreen(el?: HTMLElement | null): Promise<void> {
  if (!el) return;
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await el.requestFullscreen();
    }
  } catch {}
}

export function toggleFullscreenSync(el?: HTMLElement | null) {
  void toggleFullscreen(el);
}
