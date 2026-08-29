// Copies a rendered HTML email to the clipboard as real HTML (text/html) so
// pasting into Gmail compose keeps the theme, logo and colors. Falls back to
// the classic select-range + document.execCommand('copy') trick which writes
// the rendered rich text.

export type CopyHtmlResult = 'html' | 'fallback' | 'fail';

export async function copyRichHtml(html: string, plainText?: string): Promise<CopyHtmlResult> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plainText ?? ''], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return 'html';
    } catch {
      // Fall through to the render-based method.
    }
  }

  const host = document.createElement('div');
  host.contentEditable = 'true';
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:16px;height:16px;overflow:hidden;';
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    const range = document.createRange();
    range.selectNodeContents(host);
    const sel = window.getSelection();
    if (!sel) return 'fail';
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('copy');
    sel.removeAllRanges();
    return ok ? 'fallback' : 'fail';
  } finally {
    document.body.removeChild(host);
  }
}