import QRCode from 'qrcode';
import { CertTheme, DEFAULT_THEME, getRoleRecognition, CertSignatory, resolveDesign } from './cert-theme';

export interface CertPDFData {
  certificateId: string;
  memberName: string;
  universityId: string;
  department: string;
  session?: string;
  post?: string;
  eventName?: string;
  servicePeriod?: string;
  clubName: string;
  clubLogoUrl?: string;
  iiucLogoUrl?: string;
  issuedBy: string;
  issuedAt: string;
  siteUrl?: string;
  signatories?: CertSignatory[];
  theme?: CertTheme;
}

// ---------------------------------------------------------------------------
// Page geometry — A4 landscape, millimetres, fixed internal layout system.
// Everything is positioned relative to a bordered canvas with a constant safe
// margin so the design never collides with the paper edge.
// ---------------------------------------------------------------------------
const PAGE_W = 297;
const PAGE_H = 210;
const CX = PAGE_W / 2;

// Outer frame drawn on the paper.
const FRAME = 9;
const FRAME_INNER = 12;

// Usable content box (everything must stay inside).
const CONTENT_L = FRAME_INNER + 3;
const CONTENT_R = PAGE_W - FRAME_INNER - 3;
const CONTENT_W = CONTENT_R - CONTENT_L;
const CONTENT_TOP = FRAME_INNER + 3;

// ---------------------------------------------------------------------------
// Image loading helpers
// ---------------------------------------------------------------------------
async function loadImage(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch { return undefined; }
}

// ---------------------------------------------------------------------------
// Canvas-based helpers (client-side only). Used for calligraphy recipient name
// and auto-generated signatures so we can use elegant script fonts that jsPDF
// does not ship. Falls back gracefully to vector Times when unavailable.
// ---------------------------------------------------------------------------
let scriptFontsLoaded = false;
function loadGoogleFonts(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (scriptFontsLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.href =
      'https://fonts.googleapis.com/css2?family=Great+Vibes&family=Allura&family=Cinzel:wght@500;600;700&family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=Dancing+Script:wght@600;700&display=swap';
    link.rel = 'stylesheet';
    link.onload = () => { scriptFontsLoaded = true; resolve(); };
    link.onerror = () => { scriptFontsLoaded = true; resolve(); };
    document.head.appendChild(link);
  });
}

// Render text as a PNG data-URL on a transparent canvas using a script font,
// auto-fitting the font size so the whole string fits the requested width.
async function renderScriptText(
  text: string,
  opts: { font: string; maxWidthPx: number; maxHeightPx: number; color?: string; fallbackSizePx?: number; forceUppercase?: boolean },
): Promise<string | null> {
  const maxWidthPx = Math.max(200, opts.maxWidthPx);
  const maxHeightPx = Math.max(80, opts.maxHeightPx);

  if (typeof document === 'undefined') return null;
  await loadGoogleFonts();

  // Ensure the specific face is actually usable before measuring.
  try {
    if (document.fonts && typeof document.fonts.load === 'function') {
      await document.fonts.load(`40px "${opts.font}"`);
    }
  } catch {}

  const useUpperCase = !!opts.forceUppercase;
  const display = useUpperCase ? text.toUpperCase() : text;

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = maxWidthPx * scale;
  canvas.height = maxHeightPx * scale * 1.15;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let fontSize = opts.fallbackSizePx || 90;
  const baseline = canvas.height / (2 * scale);

  let width = Infinity;
  const measure = () => {
    ctx.font = `${fontSize}px "${opts.font}", cursive, serif`;
    return ctx.measureText(display).width;
  };

  // Fit within width, and shrink if we exceed height.
  while (fontSize > 14) {
    width = measure();
    if (width <= maxWidthPx && fontSize <= maxHeightPx) break;
    fontSize -= 2;
  }
  // Final fallback shrink.
  while (fontSize > 10 && measure() > maxWidthPx) fontSize -= 1;

  const color = opts.color || '#1a1a2e';
  ctx.font = `${fontSize}px "${opts.font}", cursive, serif`;
  ctx.fillStyle = color;
  ctx.fillText(display, maxWidthPx / 2, baseline);

  // Remove transparent margins conservatively.
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
  const d = imgData.data;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (d[(y * canvas.width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX <= minX || maxY <= minY) return null;
  const pad = 4 * scale;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(canvas.width, maxX + pad);
  maxY = Math.min(canvas.height, maxY + pad);

  const w = maxX - minX;
  const h = maxY - minY;
  const cropped = document.createElement('canvas');
  cropped.width = w;
  cropped.height = h;
  const cctx = cropped.getContext('2d');
  if (!cctx) return null;
  cctx.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);

  return cropped.toDataURL('image/png');
}

// ---------------------------------------------------------------------------
// Text-fitting engine
// ---------------------------------------------------------------------------
function setStyle(p: any, font: 'serif' | 'sans', style: 'normal' | 'bold' | 'italic', size: number, color: [number, number, number]) {
  const fam = font === 'serif' ? 'times' : 'helvetica';
  p.setFont(fam, style);
  p.setFontSize(size);
  p.setTextColor(color[0], color[1], color[2]);
}

// Reduce font size until the given text fits within maxWidth. Returns fitted size.
function fitFontToWidth(p: any, text: string, startSize: number, maxWidth: number, minSize: number): number {
  let size = startSize;
  p.setFontSize(size);
  while (size > minSize && p.getTextWidth(text) > maxWidth) {
    size -= 0.25;
    p.setFontSize(size);
  }
  p.setFontSize(size);
  return size;
}

// Wrap a paragraph to a max width, shrinking the font (down to minSize) until the
// number of wrapped lines is within maxLines. Returns { lines, size, lineHeight }.
function wrapParagraph(
  p: any,
  text: string,
  startSize: number,
  maxWidth: number,
  maxLines: number,
  minSize: number,
): { lines: string[]; size: number; lineHeight: number } {
  let size = startSize;
  let lines: string[] = [];
  const lh = (s: number) => s * 0.62;

  for (let tries = 0; tries < 30; tries++) {
    p.setFontSize(size);
    lines = p.splitTextToSize(text, maxWidth) as string[];
    if (Array.isArray(lines) && lines.length <= maxLines && lines.length > 0) break;
    size -= 0.25;
    if (size < minSize) break;
  }
  p.setFontSize(size);
  return { lines, size, lineHeight: lh(size) };
}

// ---------------------------------------------------------------------------
// Section drawing functions
// ---------------------------------------------------------------------------
function lighten(c: [number, number, number], t: number): [number, number, number] {
  return [Math.round(c[0] + (255 - c[0]) * t), Math.round(c[1] + (255 - c[1]) * t), Math.round(c[2] + (255 - c[2]) * t)] as [number, number, number];
}

function drawBackground(p: any, t: CertTheme) {
  // Paper base.
  p.setFillColor(255, 255, 255);
  p.rect(0, 0, PAGE_W, PAGE_H, 'F');

  // Interior ivory tone.
  p.setFillColor(...t.colors.background);
  p.rect(FRAME - 0.8, FRAME - 0.8, PAGE_W - 2 * (FRAME - 0.8), PAGE_H - 2 * (FRAME - 0.8), 'F');

  // Subtle two-tone border field (like a printed mat).
  const field = lighten(t.colors.background, 0.02);
  p.setFillColor(...field);
  p.rect(FRAME, FRAME, PAGE_W - 2 * FRAME, PAGE_H - 2 * FRAME, 'F');
}

function drawCorner(p: any, x: number, y: number, sx: number, sy: number, primary: [number, number, number], secondary: [number, number, number]) {
  const s = 13;
  // Outer L frame.
  p.setDrawColor(...primary);
  p.setLineWidth(0.7);
  p.lines([[s * sx, 0], [0, s * sy]], x, y, [1, 1], 'S', false);
  // Inner fine L.
  p.setDrawColor(...secondary);
  p.setLineWidth(0.25);
  p.lines([[s * 0.72 * sx, 0], [0, s * 0.72 * sy]], x + 1.4 * sx, y + 1.4 * sy, [1, 1], 'S', false);
  // Small terminal diamond.
  const dx = x + (s + 3) * sx;
  const dy = y + (s + 3) * sy;
  p.setFillColor(...secondary);
  p.triangle(dx, dy - 1.4, dx + 1.4, dy, dx, dy + 1.4, 'F');
  p.triangle(dx - 1.4, dy, dx, dy - 1.4, dx, dy + 1.4, 'F');
}

function drawBorder(p: any, t: CertTheme) {
  const primary = t.colors.primary;
  const secondary = t.colors.secondary;

  // Outer double frame.
  p.setDrawColor(...primary);
  p.setLineWidth(1.1);
  p.rect(FRAME, FRAME, PAGE_W - 2 * FRAME, PAGE_H - 2 * FRAME, 'S');

  p.setLineWidth(0.25);
  p.rect(FRAME + 1.6, FRAME + 1.6, PAGE_W - 2 * (FRAME + 1.6), PAGE_H - 2 * (FRAME + 1.6), 'S');

  // Inner gold accent frame.
  p.setDrawColor(...secondary);
  p.setLineWidth(0.35);
  p.rect(FRAME_INNER, FRAME_INNER, PAGE_W - 2 * FRAME_INNER, PAGE_H - 2 * FRAME_INNER, 'S');

  if (t.border.cornerOrnaments) {
    drawCorner(p, FRAME_INNER, FRAME_INNER, 1, 1, primary, secondary);
    drawCorner(p, PAGE_W - FRAME_INNER, FRAME_INNER, -1, 1, primary, secondary);
    drawCorner(p, FRAME_INNER, PAGE_H - FRAME_INNER, 1, -1, primary, secondary);
    drawCorner(p, PAGE_W - FRAME_INNER, PAGE_H - FRAME_INNER, -1, -1, primary, secondary);
  }
}

function drawHeader(p: any, t: CertTheme, data: CertPDFData, logos: { iiuc?: string; club?: string }) {
  const design = resolveDesign(t.design);
  let yCursor = CONTENT_TOP + 4;
  const top = yCursor;
  const boxH = 26;

  // Logos (configurable size, preserved aspect). imageRatio is a fallback aspect
  // (w/h) used because jsPDF cannot readily read PNG pixel dimensions before add.
  const maxLogoW = design.logo.width || 20;
  const maxLogoH = design.logo.height || 14;
  const logoOpacity = design.logo.opacity != null ? design.logo.opacity : 1;
  const drawLogo = (u: string, x: number, y: number, w: number, h: number) => {
    try {
      // setGState forced white background would collide with ivory paper; instead
      // we keep the logo full-opacity (transparency preserved by PNG). Opacity is
      // honored via a composite when rendering to canvas export.
      p.addImage(u, 'PNG', x, y, w, h);
    } catch {}
  };
  if (logos.iiuc) drawLogo(logos.iiuc, CONTENT_L + 1, yCursor + 2, maxLogoW, maxLogoH);
  if (logos.club) drawLogo(logos.club, CONTENT_R - 1 - maxLogoW, yCursor + 2, maxLogoW, maxLogoH);

  // Center: institution block.
  const centerL = CONTENT_L + (logos.iiuc ? maxLogoW + 8 : 0);
  const centerR = CONTENT_R - (logos.club ? maxLogoW + 8 : 0);
  const centerW = centerR - centerL;

  // University name — fitted, letter-spaced serif small caps.
  const uniText = design.text.institutionName || 'INTERNATIONAL ISLAMIC UNIVERSITY CHITTAGONG';
  p.setFont('times', 'bold');
  let uniSize = 14;
  p.setFontSize(uniSize);
  while (uniSize > 8 && p.getTextWidth(uniText) > centerW) { uniSize -= 0.25; p.setFontSize(uniSize); }
  p.setTextColor(...t.colors.primary);
  p.text(uniText, CX, yCursor + 6, { align: 'center' });

  yCursor += 8.2;

  if (t.header.showLocation !== false) {
    setStyle(p, 'sans', 'italic', 5.6, t.colors.muted);
    p.text(design.text.tagline || 'An International Centre for Higher Education and Research', CX, yCursor, { align: 'center' });
    yCursor += 5.4;
  }

  if (data.department) {
    p.setFont('times', 'bold');
    let depSize = 9;
    p.setFontSize(depSize);
    const depText = `Department of ${data.department}`;
    while (depSize > 6 && p.getTextWidth(depText) > centerW) { depSize -= 0.25; p.setFontSize(depSize); }
    p.setTextColor(...t.colors.text);
    p.text(depText, CX, yCursor, { align: 'center' });
    yCursor += 6;
  }

  if (data.clubName) {
    p.setFont('times', 'bold');
    let clubSize = 10.5;
    p.setFontSize(clubSize);
    while (clubSize > 6.5 && p.getTextWidth(data.clubName) > centerW) { clubSize -= 0.25; p.setFontSize(clubSize); }
    p.setTextColor(...t.colors.secondary);
    p.text(data.clubName, CX, yCursor, { align: 'center' });
    yCursor += 6;
  }

  // Thin rule under header.
  const ruleY = top + boxH + 3;
  p.setDrawColor(...t.colors.secondary);
  p.setLineWidth(0.3);
  p.line(CX - 55, ruleY, CX + 55, ruleY);
  p.setFillColor(...t.colors.secondary);
  p.circle(CX, ruleY, 0.7, 'F');

  // Optional Bismillah marker. jsPDF's built-in fonts have no Arabic glyphs, so
  // in the vector PDF we render an elegant ornament divider instead of garbage
  // glyph boxes. The actual Arabic calligraphy is drawn by the canvas/PNG export
  // path (client-side) where a real Arabic font is available.
  if (design.bismillah.enabled !== false) {
    try {
      const by = ruleY + 4.2;
      p.setDrawColor(...design.bismillah.color || t.colors.muted);
      p.setLineWidth(0.2);
      p.line(CX - 18, by, CX - 3, by);
      p.line(CX + 3, by, CX + 18, by);
      p.setFillColor(...(design.bismillah.color || t.colors.muted));
      p.circle(CX, by, 0.6, 'F');
      return by + 2.4;
    } catch {
      return ruleY;
    }
  }

  return ruleY;
}

function drawTitle(p: any, t: CertTheme, y: number) {
  const design = resolveDesign(t.design);
  const primary = t.colors.primary;
  const secondary = t.colors.secondary;

  // Main title.
  p.setFont('times', 'bold');
  const titleText = design.text.mainTitle || 'CERTIFICATE';
  let size = design.fonts.titleFontSize || 30;
  p.setFontSize(size);
  while (size > 16 && p.getTextWidth(titleText) > CONTENT_W - 40) { size -= 0.5; p.setFontSize(size); }
  p.setTextColor(...primary);
  p.text(titleText, CX, y, { align: 'center' });
  const titleW = p.getTextWidth(titleText);

  // Flanking flourishes.
  p.setDrawColor(...secondary);
  p.setLineWidth(0.3);
  const fy = y - 1;
  const fx1 = CX - titleW / 2 - 18;
  const fx2 = CX + titleW / 2 + 18;
  p.line(fx1, fy, fx1 + 11, fy);
  p.line(fx1, fy + 0.9, fx1 + 7, fy + 0.9);
  p.line(fx2, fy, fx2 - 11, fy);
  p.line(fx2, fy + 0.9, fx2 - 7, fy + 0.9);
  p.setFillColor(...secondary);
  p.circle(fx1 - 1, fy + 0.4, 0.6, 'F');
  p.circle(fx2 + 1, fy + 0.4, 0.6, 'F');

  // Diamond separator.
  const sepY = y + 4.6;
  p.setFillColor(...secondary);
  p.triangle(CX, sepY - 1.1, CX - 1.1, sepY, CX, sepY + 1.1, 'F');
  p.triangle(CX - 1.1, sepY, CX, sepY - 1.1, CX, sepY + 1.1, 'F');

  // Subtitle.
  const subtitle = (design.text.subtitle || t.title?.subtitle || 'OF APPRECIATION').toUpperCase();
  setStyle(p, 'sans', 'bold', design.fonts.subtitleFontSize || 10, secondary);
  p.setCharSpace(design.fonts.titleLetterSpacing != null ? design.fonts.titleLetterSpacing : 3.4);
  p.text(subtitle, CX, sepY + 5.4, { align: 'center' });
  p.setCharSpace(0);

  return sepY + 5.4;
}

async function drawBody(p: any, t: CertTheme, data: CertPDFData, startY: number) {
  const design = resolveDesign(t.design);
  const textColor = t.colors.text;
  const primary = t.colors.primary;
  const secondary = t.colors.secondary;
  const maxWidth = CONTENT_W - 30;

  let y = startY + 4.5;

  // Intro line.
  setStyle(p, 'serif', 'normal', design.fonts.bodySize || 9.5, textColor);
  p.setCharSpace(1.2);
  p.text(design.text.intro || 'This is to certify that', CX, y, { align: 'center' });
  p.setCharSpace(0);
  y += 6.4;

  // ---- Recipient name (calligraphy via canvas, falls back to serif) ----
  const name = data.memberName.trim();
  const nameDataUrl = await renderScriptText(name, {
    font: design.fonts.nameScriptFont || 'Great Vibes',
    maxWidthPx: 900,
    maxHeightPx: 90,
    color: `rgb(${primary[0]},${primary[1]},${primary[2]})`,
  });

  const nameMaxW = CONTENT_W - 60;
  const nameSize = design.fonts.nameSize || 20;
  const serifName = () => {
    setStyle(p, 'serif', 'bold', nameSize, primary);
    p.text(name.toUpperCase(), CX, y, { align: 'center' });
  };
  if (nameDataUrl) {
    try {
      p.addImage(nameDataUrl, 'PNG', CX - nameMaxW / 2, y - 3, nameMaxW, 10);
    } catch {
      serifName();
    }
  } else {
    serifName();
  }
  y += 8.6;

  // Underline with end dots.
  let nameW = 0;
  try {
    setStyle(p, 'serif', 'bold', nameSize, primary);
    nameW = p.getTextWidth(name.toUpperCase());
  } catch { nameW = nameMaxW * 0.6; }
  const w = Math.min(nameW + 18, nameMaxW + 12);
  const uy = y - 0.6;
  p.setDrawColor(...secondary);
  p.setLineWidth(0.35);
  p.line(CX - w / 2, uy, CX + w / 2, uy);
  p.setFillColor(...secondary);
  p.circle(CX - w / 2, uy, 0.6, 'F');
  p.circle(CX + w / 2, uy, 0.6, 'F');
  y += 7;

  // ---- Recognition / body text ----
  const recognition = getRoleRecognition(data.post || '');
  let paragraphs: string[] = [];

  if (data.eventName) {
    paragraphs.push(`In recognition of your active participation in the event "${data.eventName}"`);
  }
  if (data.post && data.clubName) {
    paragraphs.push(
      `for your distinguished service and sincere contribution as ${data.post} of ${data.clubName} in strengthening the activities of our club and department, throughout ${data.servicePeriod || data.session || 'your tenure'}.`,
    );
  } else if (data.clubName) {
    paragraphs.push(
      `for your sincere service and active contribution as a member of ${data.clubName}, throughout ${data.servicePeriod || data.session || 'your tenure'}.`,
    );
  } else {
    paragraphs.push('for your sincere service, dedication, and invaluable contribution to our organization.');
  }

  const startSize = design.fonts.bodySize || 9.5;
  for (const seg of paragraphs) {
    const wrapped = wrapParagraph(p, seg, startSize, maxWidth, 3, 7.5);
    for (let i = 0; i < wrapped.lines.length; i++) {
      setStyle(p, 'serif', 'normal', wrapped.size, textColor);
      p.text(wrapped.lines[i], CX, y, { align: 'center' });
      y += wrapped.lineHeight;
    }
    y += 1.2;
  }

  // Recognition phrase (italic, muted).
  if (recognition) {
    const recText = `We sincerely appreciate your ${recognition}.`;
    const wrapped = wrapParagraph(p, recText, 8.5, maxWidth - 10, 2, 7);
    for (const line of wrapped.lines) {
      setStyle(p, 'serif', 'italic', wrapped.size, t.colors.muted);
      p.text(line, CX, y, { align: 'center' });
      y += wrapped.lineHeight;
    }
    y += 1.4;
  }

  return y;
}

function drawClosing(p: any, t: CertTheme, y: number) {
  const design = resolveDesign(t.design);
  setStyle(p, 'sans', 'bold', 7.5, t.colors.secondary);
  p.setCharSpace(1);
  p.text(design.text.closing || 'THANK YOU FOR YOUR VALUABLE CONTRIBUTION', CX, y, { align: 'center' });
  p.setCharSpace(0);
  return y + 8;
}

async function drawSignatures(p: any, t: CertTheme, signatories: CertSignatory[], topY: number, footBandTop: number) {
  const design = resolveDesign(t.design);
  const list = (signatories || []).filter(s => s.name && s.name.trim());
  const count = list.length;
  if (count === 0) return topY;

  const sigCount = Math.min(count, 3);

  const qrEnabled = design.qr.enabled !== false;
  // Keep signature slots clear of the right-corner QR block: the rightmost slot
  // must end before QR_LEFT - margin. QR occupies its own reserved region.
  const qrReserveL = qrEnabled ? CONTENT_R - 30 : CONTENT_R + 30;
  const slotW = sigCount === 1 ? 80 : sigCount === 2 ? 54 : 54;
  let slots: number[];
  if (sigCount === 1) {
    slots = [CX];
  } else if (sigCount === 2) {
    slots = [CX - 58, CX + 58];
  } else {
    // Three slots, left-shifted so the right one stays clear of the QR corner.
    const gap = ((qrReserveL - 4) - (CONTENT_L + 4) - slotW * sigCount) / (sigCount - 1);
    slots = [];
    let x = CONTENT_L + 4 + slotW / 2;
    for (let i = 0; i < sigCount; i++) {
      slots.push(x);
      x += slotW + gap;
    }
  }

  // Measure the tallest block that hangs BELOW the signature line (name + meta).
  let maxBelow = 0;
  for (let i = 0; i < sigCount; i++) {
    const sig = list[i];
    let below = 3.4 + 3.6; // name baseline offset + gap to meta
    const metaLines: string[] = [];
    if (sig.title) metaLines.push(sig.title);
    if (sig.designation) metaLines.push(sig.designation);
    for (const m of metaLines) {
      p.setFont('times', 'normal');
      p.setFontSize(6);
      const wrapped = p.splitTextToSize(m, slotW - 2) as string[];
      below += (Array.isArray(wrapped) ? wrapped.length : 1) * 3.2;
    }
    if (below > maxBelow) maxBelow = below;
  }

  const sigImgH = list.some(s => s.signatureUrl || s.autoSignature !== false) ? 11 : 0;

  // Anchor the signature line so the whole block sits just above the footer band.
  const safeBottom = footBandTop - 2;
  const availTop = topY + 6;
  const targetLine = safeBottom - maxBelow;
  const lineY = targetLine < availTop ? availTop : targetLine;

  for (let i = 0; i < sigCount; i++) {
    const sig = list[i];
    const x = slots[i];

    // Signature line.
    if (design.signatureLine.enabled !== false) {
      const lnColor = design.signatureLine.color || t.colors.muted;
      const lnThk = design.signatureLine.thickness != null ? design.signatureLine.thickness : 0.28;
      p.setDrawColor(...lnColor);
      p.setLineWidth(lnThk);
      p.line(x - slotW / 2, lineY, x + slotW / 2, lineY);
    }

    // Signature image above the line.
    if (sig.signatureUrl || sig.autoSignature !== false) {
      let sigDataUrl = sig.signatureUrl;
      if (!sigDataUrl && sig.autoSignature !== false && sig.name) {
        const { generateSignatureDataURL } = await import('./signature-gen');
        try { sigDataUrl = await generateSignatureDataURL(sig.name, 220, 60); } catch {}
      }
      if (sigDataUrl) {
        try {
          p.addImage(sigDataUrl, 'PNG', x - slotW / 2, lineY - sigImgH - 1, slotW, sigImgH);
        } catch {}
      }
    }

    const textY = lineY + 3.4;

    // Name (bold small caps).
    p.setFont('times', 'bold');
    let nSize = 7.5;
    p.setFontSize(nSize);
    while (nSize > 5 && p.getTextWidth(sig.name.toUpperCase()) > slotW - 6) { nSize -= 0.2; p.setFontSize(nSize); }
    p.setTextColor(...t.colors.text);
    p.text(sig.name.toUpperCase(), x, textY, { align: 'center' });

    let py = textY + 3.6;

    // Title / designation block (wrapped).
    const metaLines: string[] = [];
    if (sig.title) metaLines.push(sig.title);
    if (sig.designation) metaLines.push(sig.designation);
    for (const m of metaLines) {
      p.setFont('times', 'normal');
      let mSize = 6;
      p.setFontSize(mSize);
      while (mSize > 4 && p.getTextWidth(m) > slotW - 2) { mSize -= 0.2; p.setFontSize(mSize); }
      const wrapped = p.splitTextToSize(m, slotW - 2) as string[];
      for (const wl of wrapped) {
        p.setTextColor(...t.colors.muted);
        p.text(wl, x, py, { align: 'center' });
        py += 3.2;
      }
    }
  }

  return lineY - sigImgH - 1;
}

// Footer band geometry shared between the signature section and the footer row.
// The QR occupies a reserved region in the bottom-right corner; signatures must
// stay clear of it both horizontally and vertically.
const FOOTER_BAND_PAD = 2;
function footerBandTop(qrEnabled = true): number {
  const qrSize = 15;
  const extra = qrEnabled ? 0 : 6; // without QR we can drop the band closer to the edge
  return PAGE_H - FRAME_INNER - qrSize - 11 + extra - FOOTER_BAND_PAD;
}

async function drawFooter(p: any, t: CertTheme, data: CertPDFData, siteUrl: string) {
  const design = resolveDesign(t.design);
  const qrEnabled = design.qr.enabled !== false;
  const bandTop = footerBandTop(qrEnabled);
  const dateY = PAGE_H - FRAME_INNER - 4;

  // Date — bottom left.
  const d = new Date(data.issuedAt);
  const dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  p.setFont('times', 'italic');
  p.setFontSize(6.5);
  p.setTextColor(...t.colors.text);
  p.text(`Dated: ${dateStr}`, CONTENT_L + 2, dateY);

  // Certificate ID — bottom left, under the date (kept away from the QR corner).
  p.setFont('helvetica', 'normal');
  p.setFontSize(5.5);
  p.setTextColor(...t.colors.muted);
  p.text(`Certificate ID: ${data.certificateId}`, CONTENT_L + 2, dateY + 4);

  // QR — bottom right, inside its reserved region (only when enabled).
  const qrSize = 15;
  const qrX = CONTENT_R - qrSize;
  const qrY = bandTop + FOOTER_BAND_PAD;

  if (!qrEnabled) return;

  const qrUrl = `${siteUrl}/clubs/verify/${data.certificateId}`;
  let qrDataUrl: string | undefined;
  try {
    qrDataUrl = await QRCode.toDataURL(qrUrl, {
      width: 160,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });
  } catch {}

  if (qrDataUrl) {
    p.setFillColor(255, 255, 255);
    p.roundedRect(qrX - 1.5, qrY - 1.5, qrSize + 3, qrSize + 3, 1.5, 1.5, 'F');
    p.setDrawColor(...t.colors.secondary);
    p.setLineWidth(0.3);
    p.roundedRect(qrX - 1.5, qrY - 1.5, qrSize + 3, qrSize + 3, 1.5, 1.5, 'S');
    try { p.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize); } catch {}

    p.setFont('helvetica', 'normal');
    p.setFontSize(4.6);
    p.setTextColor(...t.colors.muted);
    p.text('Scan to Verify', qrX + qrSize / 2, qrY + qrSize + 4.4, { align: 'center' });
    p.setCharSpace(0.6);
    p.text(data.certificateId, qrX + qrSize / 2, qrY + qrSize + 7.8, { align: 'center' });
    p.setCharSpace(0);
  }
}

// ---------------------------------------------------------------------------
// High-resolution raster export (PNG/JPG) — A4 landscape @300 DPI (3508×2480).
// Rendered entirely on a browser <canvas> so the preview and the exported image
// are identical and print-ready. Mirrors the vector layout in the PDF path.
// ---------------------------------------------------------------------------
const EXPORT_W_PX = 3508;
const EXPORT_H_PX = 2480;
const EXPORT_PX_PER_MM = EXPORT_W_PX / PAGE_W; // ≈11.8 @300 DPI

function mmPx(mm: number): number { return mm * EXPORT_PX_PER_MM; }

async function canvasLoadImage(url: string): Promise<HTMLImageElement | null> {
  if (typeof document === 'undefined' || !url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function renderCertificateCanvas(data: CertPDFData): Promise<string> {
  if (typeof document === 'undefined') throw new Error('Canvas export requires a browser environment');
  const t = data.theme || DEFAULT_THEME;
  const d = resolveDesign(t.design);

  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_W_PX;
  canvas.height = EXPORT_H_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');

  const rgb = (c?: [number, number, number] | number[]) =>
    c ? `rgb(${c[0]},${c[1]},${c[2]})` : '#000';
  const font = (family: string, weight: string, sizePx: number, italic = false) =>
    `${italic ? 'italic ' : ''}${weight} ${sizePx}px ${family}`;

  const C = {
    contentL: mmPx(CONTENT_L), contentR: mmPx(CONTENT_R), contentW: mmPx(CONTENT_W),
    contentTop: mmPx(CONTENT_TOP), cx: mmPx(CX),
  };

  // ---- Background ----
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, EXPORT_W_PX, EXPORT_H_PX);
  ctx.fillStyle = rgb(t.colors.background);
  ctx.fillRect(mmPx(FRAME - 0.8), mmPx(FRAME - 0.8), mmPx(PAGE_W - 2 * (FRAME - 0.8)), mmPx(PAGE_H - 2 * (FRAME - 0.8)));

  // ---- Border ----
  const stroke = (c: [number, number, number], w: number) => { ctx.strokeStyle = rgb(c); ctx.lineWidth = mmPx(w); };
  const rectMM = (x: number, y: number, w: number, h: number) => ctx.strokeRect(mmPx(x), mmPx(y), mmPx(w), mmPx(h));
  stroke(t.colors.border, 1.1); rectMM(FRAME, FRAME, PAGE_W - 2 * FRAME, PAGE_H - 2 * FRAME);
  stroke(t.colors.border, 0.25); rectMM(FRAME + 1.6, FRAME + 1.6, PAGE_W - 2 * (FRAME + 1.6), PAGE_H - 2 * (FRAME + 1.6));
  stroke(t.colors.borderAccent, 0.35); rectMM(FRAME_INNER, FRAME_INNER, PAGE_W - 2 * FRAME_INNER, PAGE_H - 2 * FRAME_INNER);

  // Corner ornaments (small diamonds + L lines).
  if (t.border.cornerOrnaments) {
    const corner = (xmm: number, ymm: number, sx: number, sy: number) => {
      const x = mmPx(xmm), y = mmPx(ymm), s = mmPx(13);
      stroke(t.colors.border, 0.7); ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + s * sx, y); ctx.lineTo(x + s * sx, y + s * sy); ctx.stroke();
      stroke(t.colors.borderAccent, 0.25); ctx.beginPath();
      ctx.moveTo(x + mmPx(1.4) * sx, y + mmPx(1.4) * sy);
      ctx.lineTo(x + (mmPx(1.4) + s * 0.72) * sx, y + mmPx(1.4) * sy);
      ctx.lineTo(x + (mmPx(1.4) + s * 0.72) * sx, y + (mmPx(1.4) + s * 0.72) * sy); ctx.stroke();
      const dx = x + (s + mmPx(3)) * sx, dy = y + (s + mmPx(3)) * sy;
      ctx.fillStyle = rgb(t.colors.borderAccent);
      const r = mmPx(1.4);
      ctx.beginPath(); ctx.moveTo(dx, dy - r); ctx.lineTo(dx + r, dy); ctx.lineTo(dx, dy + r); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(dx - r, dy); ctx.lineTo(dx, dy - r); ctx.lineTo(dx, dy + r); ctx.closePath(); ctx.fill();
    };
    corner(FRAME_INNER, FRAME_INNER, 1, 1);
    corner(PAGE_W - FRAME_INNER, FRAME_INNER, -1, 1);
    corner(FRAME_INNER, PAGE_H - FRAME_INNER, 1, -1);
    corner(PAGE_W - FRAME_INNER, PAGE_H - FRAME_INNER, -1, -1);
  }

  // ---- Header ----
  let y = C.contentTop + mmPx(4);
  const boxHmm = 26;
  const logoW = mmPx(d.logo.width || 20), logoH = mmPx(d.logo.height || 14);
  if (data.iiucLogoUrl) await (await import('./canvas-img')).drawCtx(ctx as any, data.iiucLogoUrl, C.contentL + mmPx(1), y + mmPx(2), logoW, logoH, d.logo.opacity ?? 1);
  if (data.clubLogoUrl) await (await import('./canvas-img')).drawCtx(ctx as any, data.clubLogoUrl, C.contentR - mmPx(1) - logoW, y + mmPx(2), logoW, logoH, d.logo.opacity ?? 1);

  const centerL = C.contentL + (data.iiucLogoUrl ? logoW + mmPx(8) : 0);
  const centerR = C.contentR - (data.clubLogoUrl ? logoW + mmPx(8) : 0);
  const centerW = centerR - centerL;
  const centerText = (text: string, sizeMm: number, color: string, weight = 'bold', ff = 'Times New Roman', italic = false) => {
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    let s = sizeMm * EXPORT_PX_PER_MM;
    ctx.font = font(ff, weight, s, italic);
    while (s > 8 * EXPORT_PX_PER_MM && ctx.measureText(text).width > centerW) { s -= 0.25 * EXPORT_PX_PER_MM; ctx.font = font(ff, weight, s, italic); }
    ctx.fillStyle = color;
    ctx.fillText(text, C.cx, y + mmPx(6));
  };
  centerText(d.text.institutionName || 'INTERNATIONAL ISLAMIC UNIVERSITY CHITTAGONG', 14, rgb(t.colors.primary), 'bold');
  y += mmPx(8.2);
  if (t.header.showLocation !== false) {
    ctx.font = font('Helvetica', 'italic', 5.6 * EXPORT_PX_PER_MM);
    ctx.fillStyle = rgb(t.colors.muted); ctx.textAlign = 'center';
    ctx.fillText(d.text.tagline || 'An International Centre for Higher Education and Research', C.cx, y);
    y += mmPx(5.4);
  }
  if (data.department) {
    ctx.font = font('Times New Roman', 'bold', 9 * EXPORT_PX_PER_MM);
    ctx.fillStyle = rgb(t.colors.text); ctx.textAlign = 'center';
    const depText = `Department of ${data.department}`;
    let s = 9 * EXPORT_PX_PER_MM;
    while (s > 6 * EXPORT_PX_PER_MM && ctx.measureText(depText).width > centerW) { s -= 0.25 * EXPORT_PX_PER_MM; ctx.font = font('Times New Roman', 'bold', s); }
    ctx.fillText(depText, C.cx, y);
    y += mmPx(6);
  }
  if (data.clubName) {
    ctx.font = font('Times New Roman', 'bold', 10.5 * EXPORT_PX_PER_MM);
    ctx.fillStyle = rgb(t.colors.secondary); ctx.textAlign = 'center';
    let s = 10.5 * EXPORT_PX_PER_MM;
    while (s > 6.5 * EXPORT_PX_PER_MM && ctx.measureText(data.clubName).width > centerW) { s -= 0.25 * EXPORT_PX_PER_MM; ctx.font = font('Times New Roman', 'bold', s); }
    ctx.fillText(data.clubName, C.cx, y);
    y += mmPx(6);
  }
  const hdrRuleY = mmPx(CONTENT_TOP + 4) + mmPx(boxHmm) + mmPx(3);
  ctx.strokeStyle = rgb(t.colors.secondary); ctx.lineWidth = 0.3 * EXPORT_PX_PER_MM;
  ctx.beginPath(); ctx.moveTo(C.cx - mmPx(55), hdrRuleY); ctx.lineTo(C.cx + mmPx(55), hdrRuleY); ctx.stroke();
  ctx.fillStyle = rgb(t.colors.secondary); ctx.beginPath(); ctx.arc(C.cx, hdrRuleY, 0.7 * EXPORT_PX_PER_MM, 0, Math.PI * 2); ctx.fill();

  let headerBottom = hdrRuleY + mmPx(1);
  // Bismillah ornament divider (true Arabic in PDF is unavailable; canvas shows marker too)
  if (d.bismillah.enabled !== false) {
    const by = hdrRuleY + mmPx(4.2);
    ctx.strokeStyle = rgb(d.bismillah.color || t.colors.muted); ctx.lineWidth = 0.2 * EXPORT_PX_PER_MM;
    ctx.beginPath(); ctx.moveTo(C.cx - mmPx(18), by); ctx.lineTo(C.cx - mmPx(3), by); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(C.cx + mmPx(3), by); ctx.lineTo(C.cx + mmPx(18), by); ctx.stroke();
    ctx.fillStyle = rgb(d.bismillah.color || t.colors.muted); ctx.beginPath(); ctx.arc(C.cx, by, 0.6 * EXPORT_PX_PER_MM, 0, Math.PI * 2); ctx.fill();
    headerBottom = by + mmPx(2.4);
  }
  y = headerBottom + mmPx(12);

  // ---- Title ----
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const titleText = d.text.mainTitle || 'CERTIFICATE';
  let tsize = (d.fonts.titleFontSize || 30) * EXPORT_PX_PER_MM;
  ctx.font = font('Times New Roman', 'bold', tsize);
  while (tsize > 16 * EXPORT_PX_PER_MM && ctx.measureText(titleText).width > C.contentW - mmPx(40)) { tsize -= 0.5 * EXPORT_PX_PER_MM; ctx.font = font('Times New Roman', 'bold', tsize); }
  ctx.fillStyle = rgb(t.colors.primary);
  ctx.fillText(titleText, C.cx, y);
  const titleW = ctx.measureText(titleText).width;
  // flourishes
  const fy = y - mmPx(1), fx1 = C.cx - titleW / 2 - mmPx(18), fx2 = C.cx + titleW / 2 + mmPx(18);
  ctx.strokeStyle = rgb(t.colors.secondary); ctx.lineWidth = 0.3 * EXPORT_PX_PER_MM;
  const ln = (x0: number, y0: number, x1: number, y1: number) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  ln(fx1, fy, fx1 + mmPx(11), fy); ln(fx1, fy + mmPx(0.9), fx1 + mmPx(7), fy + mmPx(0.9));
  ln(fx2, fy, fx2 - mmPx(11), fy); ln(fx2, fy + mmPx(0.9), fx2 - mmPx(7), fy + mmPx(0.9));
  ctx.fillStyle = rgb(t.colors.secondary);
  ctx.beginPath(); ctx.arc(fx1 - mmPx(1), fy + mmPx(0.4), 0.6 * EXPORT_PX_PER_MM, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(fx2 + mmPx(1), fy + mmPx(0.4), 0.6 * EXPORT_PX_PER_MM, 0, Math.PI * 2); ctx.fill();
  const sepY = y + mmPx(4.6);
  const r = mmPx(1.1);
  ctx.beginPath(); ctx.moveTo(C.cx, sepY - r); ctx.lineTo(C.cx - r, sepY); ctx.lineTo(C.cx, sepY + r); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(C.cx - r, sepY); ctx.lineTo(C.cx, sepY - r); ctx.lineTo(C.cx, sepY + r); ctx.closePath(); ctx.fill();
  // subtitle
  const subSize = (d.fonts.subtitleFontSize || 10) * EXPORT_PX_PER_MM;
  ctx.font = font('Helvetica', 'bold', subSize);
  ctx.fillStyle = rgb(t.colors.secondary);
  const letterSpacing = (d.fonts.titleLetterSpacing != null ? d.fonts.titleLetterSpacing : 3.4) * EXPORT_PX_PER_MM;
  const subtitle = (d.text.subtitle || 'OF APPRECIATION').toUpperCase();
  const totalW = ctx.measureText(subtitle).width + letterSpacing * (subtitle.length - 1);
  let sx = C.cx - totalW / 2;
  ctx.fillText(subtitle, C.cx, sepY + mmPx(5.4));
  y = sepY + mmPx(5.4) + mmPx(4.5);

  // ---- Intro + name + body + closing ----
  const bodySize = (d.fonts.bodySize || 9.5) * EXPORT_PX_PER_MM;
  const maxWmm = CONTENT_W - 30;
  const wrapTex = (text: string, sizeMm: number, maxW: number, weight = 'normal', ff = 'Times New Roman', italic = false): string[] => {
    const s = sizeMm * EXPORT_PX_PER_MM;
    ctx.font = font(ff, weight, s, italic);
    const words = text.split(' ');
    const lines: string[] = []; let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > mmPx(maxW) && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  };
  ctx.fillStyle = rgb(t.colors.text); ctx.font = font('Times New Roman', 'normal', bodySize); ctx.textAlign = 'center';
  const intro = d.text.intro || 'This is to certify that';
  ctx.save(); ctx.letterSpacing = '1.2px'; ctx.fillText(intro, C.cx, y); ctx.restore();
  y += mmPx(6.4);

  // recipient name — script font with serif fallback
  const name = data.memberName.trim();
  const nameSize = (d.fonts.nameSize || 20) * EXPORT_PX_PER_MM;
  const nameLarge = name.toUpperCase();
  let shownAsScript = false;
  try {
    await loadGoogleFonts();
    if (document.fonts && typeof document.fonts.load === 'function') await document.fonts.load(`40px "${d.fonts.nameScriptFont || 'Great Vibes'}"`);
    ctx.font = font(d.fonts.nameScriptFont || 'Great Vibes', 'normal', nameSize * 1.15);
    const nw = ctx.measureText(name).width;
    const maxNW = C.contentW - mmPx(60);
    if (nw <= maxNW) { ctx.fillStyle = rgb(t.colors.primary); ctx.fillText(name, C.cx, y); shownAsScript = true; }
  } catch {}
  if (!shownAsScript) {
    let s = nameSize;
    ctx.font = font('Times New Roman', 'bold', s);
    while (s > 10 * EXPORT_PX_PER_MM && ctx.measureText(nameLarge).width > C.contentW - mmPx(60)) { s -= 0.5 * EXPORT_PX_PER_MM; ctx.font = font('Times New Roman', 'bold', s); }
    ctx.fillStyle = rgb(t.colors.primary); ctx.fillText(nameLarge, C.cx, y);
  }
  y += mmPx(8.6);
  // underline
  ctx.font = font('Times New Roman', 'bold', nameSize);
  const nameW = Math.min(ctx.measureText(nameLarge).width + mmPx(18), C.contentW - mmPx(60) + mmPx(12));
  const uy = y - mmPx(0.6);
  ctx.strokeStyle = rgb(t.colors.secondary); ctx.lineWidth = 0.35 * EXPORT_PX_PER_MM;
  ln(C.cx - nameW / 2, uy, C.cx + nameW / 2, uy);
  ctx.fillStyle = rgb(t.colors.secondary);
  ctx.beginPath(); ctx.arc(C.cx - nameW / 2, uy, 0.6 * EXPORT_PX_PER_MM, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(C.cx + nameW / 2, uy, 0.6 * EXPORT_PX_PER_MM, 0, Math.PI * 2); ctx.fill();
  y += mmPx(7);

  // body paragraphs
  const paragraphs: string[] = [];
  if (data.eventName) paragraphs.push(`In recognition of your active participation in the event "${data.eventName}"`);
  if (data.post && data.clubName) paragraphs.push(`for your distinguished service and sincere contribution as ${data.post} of ${data.clubName} in strengthening the activities of our club and department, throughout ${data.servicePeriod || data.session || 'your tenure'}.`);
  else if (data.clubName) paragraphs.push(`for your sincere service and active contribution as a member of ${data.clubName}, throughout ${data.servicePeriod || data.session || 'your tenure'}.`);
  else paragraphs.push('for your sincere service, dedication, and invaluable contribution to our organization.');
  ctx.fillStyle = rgb(t.colors.text);
  for (const seg of paragraphs) {
    for (const line of wrapTex(seg, d.fonts.bodySize || 9.5, maxWmm)) {
      ctx.font = font('Times New Roman', 'normal', bodySize); ctx.fillText(line, C.cx, y); y += mmPx(7.5);
    }
    y += mmPx(1.2);
  }
  const { getRoleRecognition } = await import('./cert-theme');
  const recognition = getRoleRecognition(data.post || '');
  if (recognition) {
    ctx.fillStyle = rgb(t.colors.muted);
    for (const line of wrapTex(`We sincerely appreciate your ${recognition}.`, 8.5, maxWmm - 10, 'normal', 'Times New Roman', true)) {
      ctx.font = font('Times New Roman', 'normal', 8.5 * EXPORT_PX_PER_MM, true); ctx.fillText(line, C.cx, y); y += mmPx(7);
    }
    y += mmPx(1.4);
  }
  // closing
  const closingSize = 7.5 * EXPORT_PX_PER_MM;
  ctx.font = font('Helvetica', 'bold', closingSize); ctx.fillStyle = rgb(t.colors.secondary);
  ctx.fillText(d.text.closing || 'THANK YOU FOR YOUR VALUABLE CONTRIBUTION', C.cx, y);
  y += mmPx(8);

  // ---- Footer band ----
  const qrOn = d.qr.enabled !== false;
  const bandTopPx = mmPx(footerBandTop(qrOn));
  const footDateY = mmPx(PAGE_H - FRAME_INNER - 4);
  const dateStr = new Date(data.issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.font = font('Times New Roman', 'italic', 6.5 * EXPORT_PX_PER_MM); ctx.textAlign = 'left'; ctx.fillStyle = rgb(t.colors.text);
  ctx.fillText(`Dated: ${dateStr}`, C.contentL + mmPx(2), footDateY);
  ctx.font = font('Helvetica', 'normal', 5.5 * EXPORT_PX_PER_MM); ctx.fillStyle = rgb(t.colors.muted);
  ctx.fillText(`Certificate ID: ${data.certificateId}`, C.contentL + mmPx(2), footDateY + mmPx(4));

  // ---- Signatures ----
  const sigs = (data.signatories || []).filter(s => s.name && s.name.trim());
  if (sigs.length > 0) {
    const sigCount = Math.min(sigs.length, 3);
    const qrReserveL = qrOn ? CONTENT_R - 30 : CONTENT_R + 30;
    const slotWmm = sigCount === 1 ? 80 : 54;
    let slots: number[];
    if (sigCount === 1) slots = [CX];
    else if (sigCount === 2) slots = [CX - 58, CX + 58];
    else {
      const gap = ((qrReserveL - 4) - (CONTENT_L + 4) - slotWmm * sigCount) / (sigCount - 1);
      slots = []; let x = CONTENT_L + 4 + slotWmm / 2;
      for (let i = 0; i < sigCount; i++) { slots.push(x); x += slotWmm + gap; }
    }
    const safeBottom = bandTopPx - mmPx(2);
    const lineY = safeBottom - mmPx(Math.min(12, 3.4 + 3.6 + 3)); // approx meta height
    for (let i = 0; i < sigCount; i++) {
      const sig = sigs[i];
      const x = C.cx + (slots[i] - CX) * EXPORT_PX_PER_MM; // px center from mm offset
      const slotW = slotWmm * EXPORT_PX_PER_MM;
      // line
      if (d.signatureLine.enabled !== false) {
        ctx.strokeStyle = rgb(d.signatureLine.color || t.colors.muted);
        ctx.lineWidth = (d.signatureLine.thickness || 0.28) * EXPORT_PX_PER_MM;
        ln(x - slotW / 2, lineY, x + slotW / 2, lineY);
      }
      // signature image
      if (sig.signatureUrl || sig.autoSignature !== false) {
        let url = sig.signatureUrl;
        if (!url && sig.autoSignature !== false && sig.name) {
          const { generateSignatureDataURL } = await import('./signature-gen');
          try { url = await generateSignatureDataURL(sig.name, 220, 60); } catch {}
        }
        if (url) { const img = await canvasLoadImage(url); if (img) ctx.drawImage(img, x - slotW / 2, lineY - mmPx(12), slotW, mmPx(11)); }
      }
      const textY = lineY + mmPx(3.4);
      ctx.textAlign = 'center';
      let ns = 7.5 * EXPORT_PX_PER_MM;
      ctx.font = font('Times New Roman', 'bold', ns);
      while (ns > 5 * EXPORT_PX_PER_MM && ctx.measureText(sig.name.toUpperCase()).width > slotW - mmPx(6)) { ns -= 0.2 * EXPORT_PX_PER_MM; ctx.font = font('Times New Roman', 'bold', ns); }
      ctx.fillStyle = rgb(t.colors.text); ctx.fillText(sig.name.toUpperCase(), x, textY);
      let py = textY + mmPx(3.6);
      const metaLines = [];
      if (sig.title) metaLines.push(sig.title);
      if (sig.designation) metaLines.push(sig.designation);
      ctx.fillStyle = rgb(t.colors.muted);
      for (const meta of metaLines) {
        for (const wl of wrapTex(meta, 6, slotWmm - 2, 'normal', 'Times New Roman')) {
          ctx.fillText(wl, x, py); py += mmPx(3.2);
        }
      }
    }
  }

  // ---- QR ----
  if (qrOn) {
    const { default: QRCode } = await import('qrcode');
    try {
      const qrUrl = `${data.siteUrl || 'https://iiuc-arms.eu.cc'}/clubs/verify/${data.certificateId}`;
      const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 200, margin: 1, errorCorrectionLevel: 'H', color: { dark: '#1a1a2e', light: '#ffffff' } });
      const qrSize = 15 * EXPORT_PX_PER_MM;
      const qrX = C.contentR - qrSize, qrY = bandTopPx + mmPx(FOOTER_BAND_PAD);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(qrX - mmPx(1.5), qrY - mmPx(1.5), qrSize + mmPx(3), qrSize + mmPx(3));
      ctx.strokeStyle = rgb(t.colors.secondary); ctx.lineWidth = 0.3 * EXPORT_PX_PER_MM;
      const r2 = mmPx(1.5);
      ctx.beginPath(); ctx.roundRect(qrX - mmPx(1.5), qrY - mmPx(1.5), qrSize + mmPx(3), qrSize + mmPx(3), r2); ctx.stroke();
      const qrImg = await canvasLoadImage(qrDataUrl);
      if (qrImg) ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
      ctx.font = font('Helvetica', 'normal', 4.6 * EXPORT_PX_PER_MM); ctx.fillStyle = rgb(t.colors.muted); ctx.textAlign = 'center';
      ctx.fillText('Scan to Verify', qrX + qrSize / 2, qrY + qrSize + mmPx(4.4));
      ctx.fillText(data.certificateId, qrX + qrSize / 2, qrY + qrSize + mmPx(7.8));
    } catch {}
  }

  return canvas.toDataURL('image/png');
}

export async function exportCertificateImage(data: CertPDFData, format: 'png' | 'jpeg' = 'png'): Promise<string> {
  const png = await renderCertificateCanvas(data);
  if (format === 'png') return png;
  const img = await canvasLoadImage(png);
  if (!img || typeof document === 'undefined') throw new Error('JPG export requires a browser');
  const c = document.createElement('canvas');
  c.width = EXPORT_W_PX; c.height = EXPORT_H_PX;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, EXPORT_W_PX, EXPORT_H_PX);
  ctx.drawImage(img, 0, 0);
  return c.toDataURL('image/jpeg', 0.92);
}

export async function downloadCertPNG(data: CertPDFData, filename?: string): Promise<void> {
  const url = await exportCertificateImage(data, 'png');
  const a = document.createElement('a');
  a.href = url; a.download = filename || `certificate-${data.certificateId}.png`;
  document.body.appendChild(a); a.click(); a.remove();
}

// ---------------------------------------------------------------------------
// Orchestrator — runs each layout pass top down, reserving the footer row.
// ---------------------------------------------------------------------------
async function renderCertificate(pdf: any, data: CertPDFData, isFirstPage: boolean) {
  if (!isFirstPage) pdf.addPage();
  pdf.setProperties({ title: `Certificate - ${data.memberName}`, creator: 'IIUC-ARMS' });

  const t = data.theme || DEFAULT_THEME;

  drawBackground(pdf, t);
  drawBorder(pdf, t);

  // Load logos up front.
  const logos: { iiuc?: string; club?: string } = {};
  const fetches: Promise<void>[] = [];
  if (data.iiucLogoUrl) fetches.push(loadImage(data.iiucLogoUrl).then(u => { if (u) logos.iiuc = u; }));
  if (data.clubLogoUrl) fetches.push(loadImage(data.clubLogoUrl).then(u => { if (u) logos.club = u; }));
  if (fetches.length > 0) await Promise.all(fetches);

  // The footer band (date/id and QR) is reserved at the bottom. Signatures are
  // only rendered where there is guaranteed room above it.
  const design = resolveDesign(t.design);
  const qrEnabled = design.qr.enabled !== false;
  const bandTop = footerBandTop(qrEnabled);

  const headerBottom = drawHeader(pdf, t, data, logos);

  let y = headerBottom + 12;
  y = drawTitle(pdf, t, y);

  const signatories = (data.signatories || []).filter(s => s.name && s.name.trim());

  y = await drawBody(pdf, t, data, y);

  // Move the closing line + signatures up if the body overflowed into the band.
  const minSigTop = bandTop - 4;
  if (signatories.length > 0) {
    if (y > minSigTop - 14) y = minSigTop - 14;
    y = drawClosing(pdf, t, y);
    await drawSignatures(pdf, t, signatories, y, bandTop);
  }

  drawFooter(pdf, t, data, data.siteUrl || 'https://iiuc-arms.eu.cc');
}

// ---------------------------------------------------------------------------
// Public exports (kept identical so callers stay compatible)
// ---------------------------------------------------------------------------
export async function generateCertificatePDF(data: CertPDFData): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  await renderCertificate(pdf, data, true);
  return pdf.output('dataurlstring');
}

export async function downloadCertPDF(data: CertPDFData, filename?: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  await renderCertificate(pdf, data, true);
  pdf.save(filename || `certificate-${data.certificateId}.pdf`);
}

export async function generateBulkCertPDF(certs: CertPDFData[]): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  for (let i = 0; i < certs.length; i++) {
    await renderCertificate(pdf, certs[i], i === 0);
  }
  pdf.save(`iiuc-certificates-${Date.now()}.pdf`);
}
