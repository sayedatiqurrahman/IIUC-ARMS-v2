let signatureFontLoaded = false;

function loadSignatureFont(): Promise<void> {
  if (signatureFontLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600;700&display=swap';
    link.rel = 'stylesheet';
    link.onload = () => { signatureFontLoaded = true; resolve(); };
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

export async function generateSignatureDataURL(name: string, width = 300, height = 80): Promise<string> {
  await loadSignatureFont();

  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = '#1a1a2e';
  ctx.font = `700 28px "Dancing Script", cursive`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lines = name.split(/\s+/);
  if (lines.length <= 2) {
    ctx.fillText(name, width / 2, height / 2);
  } else {
    const mid = Math.ceil(lines.length / 2);
    const line1 = lines.slice(0, mid).join(' ');
    const line2 = lines.slice(mid).join(' ');
    ctx.fillText(line1, width / 2, height / 2 - 12);
    ctx.fillText(line2, width / 2, height / 2 + 14);
  }

  return canvas.toDataURL('image/png');
}
