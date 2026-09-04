let signatureFontLoaded = false;

function loadSignatureFont(): Promise<void> {
  if (signatureFontLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap';
    link.rel = 'stylesheet';
    link.onload = () => { signatureFontLoaded = true; resolve(); };
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

// Text actually used to render the script signature: the user-supplied
// signature text wins; otherwise fall back to the first word of the name.
export function signatureTextFor(sig: { name: string; signatureText?: string } | string): string {
  if (typeof sig === 'string') return sig.trim().split(/\s+/)[0] || sig.trim();
  const custom = (sig.signatureText || '').trim();
  if (custom) return custom;
  const name = (sig.name || '').trim();
  return name.split(/\s+/)[0] || name;
}

export async function generateSignatureDataURL(text: string, width = 300, height = 80): Promise<string> {
  await loadSignatureFont();

  // Sign exactly what was passed — the caller resolves name vs. custom text.
  const name = (text || '').trim();

  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = '#1a1a2e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Fit the text to the canvas while keeping it comfortably large.
  const basePx = Math.min(48, 44);
  ctx.font = `${basePx}px "Great Vibes", cursive`;
  let textWidth = ctx.measureText(name).width;
  let size = basePx;
  while (textWidth > width - 24 && size > 16) {
    size -= 2;
    ctx.font = `${size}px "Great Vibes", cursive`;
    textWidth = ctx.measureText(name).width;
  }
  ctx.fillText(name, width / 2, height / 2 + size * 0.12);

  return canvas.toDataURL('image/png');
}