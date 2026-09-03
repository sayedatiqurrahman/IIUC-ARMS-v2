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
// Font metrics + baseline pitch. jsPDF measures text widths in the document
// unit (mm) but setFontSize() takes points, so point sizes are converted.
// Using these everywhere guarantees centered lines never overlap regardless of
// the font sizes chosen by a theme.
// ---------------------------------------------------------------------------
const PT_MM = 0.3528;
const fontAscent = (pt: number) => pt * PT_MM * 0.9;
const fontDescent = (pt: number) => pt * PT_MM * 0.25;

// Baseline-to-baseline pitch needed between a line of size `prevPt` and the
// next line of size `nextPt`: previous descenders + next ascenders + breathing.
const linePitch = (prevPt: number, nextPt: number) => fontDescent(prevPt) + fontAscent(nextPt) + 2.2;

// Draw one centered line, shrinking until it fits maxWidth. Returns the size used.
function drawCenteredText(
  p: any,
  text: string,
  fam: 'serif' | 'sans',
  style: 'normal' | 'bold' | 'italic',
  size: number,
  color: [number, number, number],
  baseline: number,
  maxWidth: number,
  minSize: number,
): number {
  p.setFont(fam, style);
  let s = size;
  p.setFontSize(s);
  while (s > minSize && p.getTextWidth(text) > maxWidth) {
    s -= 0.25;
    p.setFontSize(s);
  }
  p.setTextColor(...color);
  p.text(text, CX, baseline, { align: 'center' });
  return s;
}

// ---------------------------------------------------------------------------
// Section drawing functions
// ---------------------------------------------------------------------------
function lighten(c: [number, number, number], t: number): [number, number, number] {
  return [Math.round(c[0] + (255 - c[0]) * t), Math.round(c[1] + (255 - c[1]) * t), Math.round(c[2] + (255 - c[2]) * t)] as [number, number, number];
}

// Decorative green frame — picket-fence style with a fine inner line, evoking
// the hand-illustrated sample certificate. Metal-green on cream.
function drawBackground(p: any, t: CertTheme) {
  // Paper base (off-white).
  p.setFillColor(255, 255, 255);
  p.rect(0, 0, PAGE_W, PAGE_H, 'F');

  // Interior cream tone.
  p.setFillColor(...t.colors.background);
  p.rect(FRAME - 0.8, FRAME - 0.8, PAGE_W - 2 * (FRAME - 0.8), PAGE_H - 2 * (FRAME - 0.8), 'F');
}

// Draw a small ornamental flower/diamond used at frame corners.
function drawCornerOrnament(p: any, x: number, y: number, color: [number, number, number], r = 1.6) {
  p.setFillColor(...color);
  const rr = r;
  // 4-petal flower via two rotated diamonds.
  p.triangle(x, y - rr, x - rr * 0.7, y, x, y + rr, 'F');
  p.triangle(x, y - rr, x + rr * 0.7, y, x, y + rr, 'F');
  p.triangle(x - rr, y, x, y - rr * 0.7, x, y + rr * 0.7, 'F');
  p.triangle(x - rr, y, x, y - rr * 0.7, x, y + rr * 0.7, 'F');
  p.circle(x, y, rr * 0.28, 'F');
}

// Decorative border: a thick green band with a stepped "picket fence" top and
// bottom, plus a diamond-studded inner line and corner flowers.
function drawBorder(p: any, t: CertTheme) {
  const primary = t.colors.primary;
  const secondary = t.colors.secondary;
  const greenLight: [number, number, number] = [22, 139, 10];

  // Outer fine green frame.
  p.setDrawColor(...primary);
  p.setLineWidth(0.5);
  p.rect(FRAME + 0.6, FRAME + 0.6, PAGE_W - 2 * (FRAME + 0.6), PAGE_H - 2 * (FRAME + 0.6), 'S');

  // Inner double line.
  p.setDrawColor(...secondary);
  p.setLineWidth(0.25);
  p.rect(FRAME_INNER + 1.4, FRAME_INNER + 1.4, PAGE_W - 2 * (FRAME_INNER + 1.4), PAGE_H - 2 * (FRAME_INNER + 1.4), 'S');

  // Diamond rail along the inner frame.
  p.setDrawColor(...secondary);
  p.setLineWidth(0.18);
  p.rect(FRAME_INNER, FRAME_INNER, PAGE_W - 2 * FRAME_INNER, PAGE_H - 2 * FRAME_INNER, 'S');

  // Corner flowers.
  if (t.border.cornerOrnaments) {
    const fr = 2.2;
    const d = 4.2;
    const f = (x: number, y: number) => {
      drawCornerOrnament(p, x, y, greenLight, fr);
      p.setDrawColor(...secondary);
      p.setLineWidth(0.3);
      p.circle(x, y, 1.1, 'S');
    };
    f(FRAME_INNER + d, FRAME_INNER + d);
    f(PAGE_W - FRAME_INNER - d, FRAME_INNER + d);
    f(FRAME_INNER + d, PAGE_H - FRAME_INNER - d);
    f(PAGE_W - FRAME_INNER - d, PAGE_H - FRAME_INNER - d);
  }

  // Bottom green band.
  p.setFillColor(...primary);
  p.rect(FRAME, PAGE_H - FRAME_INNER - 4.5, PAGE_W - 2 * FRAME, 4.5, 'F');

  // Deep-green accent under the band.
  p.setFillColor(11, 110, 8);
  p.rect(FRAME, PAGE_H - FRAME_INNER - 4.5, PAGE_W - 2 * FRAME, 1, 'F');
}

// Slim decorative strip at the very top — subtle green accent bars at the left
// edge, keeping the top-left / top-right corners clear for the header logos.
function drawTopDecoration(p: any, t: CertTheme) {
  const green: [number, number, number] = [22, 139, 10];
  const greenDeep: [number, number, number] = [17, 110, 8];

  // Corner accents that stay out of the way of the two header logos.
  p.setFillColor(...greenDeep);
  p.rect(FRAME, FRAME, 3, 3, 'F');
  p.setFillColor(...green);
  p.rect(PAGE_W - FRAME - 3, FRAME, 3, 3, 'F');
  p.rect(FRAME, FRAME + 5, 2.2, 26, 'F');
  p.rect(PAGE_W - FRAME - 2.2, FRAME + 5, 2.2, 26, 'F');
}

// The new design drops the university banner at the top; the header reduces to
// the top decorative strip plus a modest university line. Returns the y offset
// where the title begins.
function drawHeader(p: any, t: CertTheme, data: CertPDFData, logos: { iiuc?: string; club?: string }): number {
  const design = resolveDesign(t.design);
  drawTopDecoration(p, t);

  // University + department line at the very top centre, small and elegant.
  const top = CONTENT_TOP + 2.5;
  const centerW = CONTENT_W - 110;

  const uniText = design.text.institutionName || 'INTERNATIONAL ISLAMIC UNIVERSITY CHITTAGONG';
  const uniSize = drawCenteredText(p, uniText, 'serif', 'bold', 9.5, t.colors.primary, top + fontAscent(9.5), centerW, 6);

  let base = top + fontAscent(uniSize);
  let size = uniSize;
  if (data.department) {
    const depText = `Department of ${data.department}`;
    const depSize = drawCenteredText(p, depText, 'serif', 'bold', 7.5, t.colors.text, base + linePitch(size, 7.5), centerW, 5.5);
    base += linePitch(size, depSize);
    size = depSize;
  }

  // Header logos — club/org on the left, university on the right. Each is fitted
  // into a fixed-height band (14mm) preserving its natural aspect ratio.
  const logoH = 14;
  const logoTop = FRAME_INNER + 3.5;
  const logoSlotW = 26;
  const fitLogo = (u: string, xRightAligned: boolean) => {
    try {
      const info = p.getImageProperties(u);
      const ratio = info.width / info.height;
      let w = logoH * ratio;
      if (w > logoSlotW) { w = logoSlotW; const h = w / ratio; p.addImage(u, 'PNG', xRightAligned ? CONTENT_R - w : CONTENT_L, logoTop + (logoH - h) / 2, w, h); return; }
      p.addImage(u, 'PNG', xRightAligned ? CONTENT_R - w : CONTENT_L, logoTop + (logoH - w / ratio) / 2, w, logoH);
    } catch {}
  };
  if (logos.club) fitLogo(logos.club, false);
  if (logos.iiuc) fitLogo(logos.iiuc, true);

  // Thin elegant rule below the university line.
  const ruleY = base + fontDescent(size) + 2.6;
  p.setDrawColor(...t.colors.secondary);
  p.setLineWidth(0.25);
  p.line(CX - 60, ruleY, CX + 60, ruleY);
  p.setFillColor(...t.colors.secondary);
  p.circle(CX, ruleY, 0.6, 'F');

  return ruleY + 1.4;
}

function drawTitle(p: any, t: CertTheme, headerBottom: number) {
  const design = resolveDesign(t.design);
  const primary = t.colors.primary;
  const secondary = t.colors.secondary;
  const ink: [number, number, number] = [23, 23, 23];

  // "CERTIFICATE" — large, letter-spaced, deep green.
  const titlePt = design.fonts.titleFontSize || 26;
  const titleBase = headerBottom + 4.5 + fontAscent(titlePt);
  const titleText = design.text.mainTitle || 'CERTIFICATE';
  const titleMaxW = CONTENT_W - 90;
  const titleSize = drawCenteredText(p, titleText, 'serif', 'bold', titlePt, primary, titleBase, titleMaxW, 16);

  // Embellishment row under the title (a short rule + central diamond).
  const decoY = titleBase + fontDescent(titleSize) + 1.6;
  p.setDrawColor(...secondary);
  p.setLineWidth(0.3);
  p.line(CX - 16, decoY, CX - 2.5, decoY);
  p.line(CX + 2.5, decoY, CX + 16, decoY);
  p.setFillColor(...secondary);
  p.triangle(CX, decoY - 1.2, CX - 1.2, decoY, CX, decoY + 1.2, 'F');
  p.triangle(CX - 1.2, decoY, CX, decoY - 1.2, CX, decoY + 1.2, 'F');

  // "OF ACHIEVEMENT" — letter-spaced, ink.
  const subPt = design.fonts.subtitleFontSize || 10;
  const subBase = decoY + 2.6 + fontAscent(subPt);
  const subtitle = (design.text.subtitle || t.title?.subtitle || 'OF ACHIEVEMENT').toUpperCase();
  setStyle(p, 'serif', 'bold', subPt, ink);
  p.setCharSpace(design.fonts.titleLetterSpacing != null ? design.fonts.titleLetterSpacing : 3.2);
  p.text(subtitle, CX, subBase, { align: 'center' });
  p.setCharSpace(0);

  return subBase + fontDescent(subPt) + 0.4;
}

async function drawBody(p: any, t: CertTheme, data: CertPDFData, startY: number, closingMax: number) {
  const design = resolveDesign(t.design);
  const textColor = t.colors.text;
  const primary = t.colors.primary;
  const secondary = t.colors.secondary;
  const maxWidth = CONTENT_W - 30;

  // ── Fixed intro + recipient name + underline block ──
  const introBase = startY + 2;
  setStyle(p, 'serif', 'normal', design.fonts.bodySize || 9.5, textColor);
  p.setCharSpace(1.4);
  p.text(design.text.intro || 'This is to certify that', CX, introBase, { align: 'center' });
  p.setCharSpace(0);
  const introBottom = introBase + fontDescent(9.5);

  const name = data.memberName.trim();
  const nameDataUrl = await renderScriptText(name, {
    font: design.fonts.nameScriptFont || 'Great Vibes',
    maxWidthPx: 900,
    maxHeightPx: 96,
    color: `rgb(${primary[0]},${primary[1]},${primary[2]})`,
  });

  const nameMaxW = CONTENT_W - 60;
  const nameTop = introBottom + 2.8;
  const nameBottom = nameTop + 10.5;
  const serifName = () => {
    setStyle(p, 'serif', 'bold', design.fonts.nameSize || 20, primary);
    p.text(name.toUpperCase(), CX, nameBottom - 1.2, { align: 'center' });
  };
  if (nameDataUrl) {
    try {
      p.addImage(nameDataUrl, 'PNG', CX - nameMaxW / 2, nameTop, nameMaxW, 10.5);
    } catch {
      serifName();
    }
  } else {
    serifName();
  }

  const underlineY = nameBottom + 1.6;
  let nameW = 0;
  try {
    setStyle(p, 'serif', 'bold', design.fonts.nameSize || 20, primary);
    nameW = p.getTextWidth(name.toUpperCase());
  } catch { nameW = nameMaxW * 0.6; }
  const w = Math.min(nameW + 18, nameMaxW + 12);
  p.setDrawColor(...secondary);
  p.setLineWidth(0.35);
  p.line(CX - w / 2, underlineY, CX + w / 2, underlineY);
  p.setFillColor(...secondary);
  p.circle(CX - w / 2, underlineY, 0.7, 'F');
  p.circle(CX + w / 2, underlineY, 0.7, 'F');

  const bodyFirstBase = underlineY + 6.6;

  // ── Recognition / body paragraphs ──
  const recognition = getRoleRecognition(data.post || '');
  const recText = recognition ? `We sincerely appreciate your ${recognition}.` : '';
  const paragraphs: string[] = [];

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

  // Total height in mm of paragraphs + recognition at a given body size.
  const bodyHeight = (size: number) => {
    let total = 0;
    for (const seg of paragraphs) {
      const wN = wrapParagraph(p, seg, size, maxWidth, 3, 7);
      total += wN.lines.length * wN.lineHeight + 1.2;
    }
    if (recText) {
      const rSize = Math.min(size + 0.5, 8.5);
      const wN = wrapParagraph(p, recText, rSize, maxWidth - 10, 2, 7);
      total += wN.lines.length * wN.lineHeight + 1.4;
    }
    return total;
  };

  // Auto-fit: pick the largest body size whose content fits above the closing
  // line (closingMax - 6 reserves room for "THANK YOU…"). This is what keeps the
  // certificate text from ever piling onto the next section.
  const avail = closingMax - 6 - bodyFirstBase;
  const startSize = design.fonts.bodySize || 9.5;
  let chosen = startSize;
  for (let k = startSize; k >= 7.25; k -= 0.25) {
    chosen = k;
    if (bodyHeight(k) <= avail) break;
  }

  // Draw paragraphs + recognition at the chosen size.
  let y = bodyFirstBase;
  for (const seg of paragraphs) {
    const wN = wrapParagraph(p, seg, chosen, maxWidth, 3, 7);
    for (const line of wN.lines) {
      setStyle(p, 'serif', 'normal', wN.size, textColor);
      p.text(line, CX, y, { align: 'center' });
      y += wN.lineHeight;
    }
    y += 1.2;
  }
  if (recText) {
    const rSize = Math.min(chosen + 0.5, 8.5);
    const wN = wrapParagraph(p, recText, rSize, maxWidth - 10, 2, 7);
    for (const line of wN.lines) {
      setStyle(p, 'serif', 'italic', wN.size, t.colors.muted);
      p.text(line, CX, y, { align: 'center' });
      y += wN.lineHeight;
    }
  }

  return y;
}

function drawClosing(p: any, t: CertTheme, y: number) {
  const design = resolveDesign(t.design);
  setStyle(p, 'sans', 'bold', 7.5, t.colors.secondary);
  p.setCharSpace(1.2);
  p.text(design.text.closing || 'THANK YOU FOR YOUR VALUABLE CONTRIBUTION', CX, y, { align: 'center' });
  p.setCharSpace(0);
  return y + 8.5;
}

// ── Best-Award seal ────────────────────────────────────────────────────────
// A clean circular green "BEST AWARD" medal on the right side (the header
// carries the club and university logos separately at the top corners).
const SEAL_D = 34;               // seal outer diameter (mm)
const SEAL_CX = PAGE_W - FRAME_INNER - 26;
const SEAL_CY = 118;

function drawSeal(p: any, t: CertTheme) {
  const green: [number, number, number] = [22, 139, 10];
  const greenDeep: [number, number, number] = [17, 110, 8];
  const r = SEAL_D / 2;
  const cx = SEAL_CX;
  const cy = SEAL_CY;

  // Outer green disc.
  p.setFillColor(...green);
  p.circle(cx, cy, r, 'F');

  // Cream inner disc.
  p.setFillColor(...t.colors.background);
  p.circle(cx, cy, r - 3, 'F');

  // Ink ring on the cream disc.
  p.setDrawColor(...greenDeep);
  p.setLineWidth(0.5);
  p.circle(cx, cy, r - 5.6, 'S');

  // "BEST AWARD" centered in the medal.
  p.setFont('times', 'bold');
  p.setFontSize(6.5);
  p.setTextColor(...greenDeep);
  p.text('BEST', cx, cy - 2, { align: 'center' });
  p.setFontSize(6.5);
  p.text('AWARD', cx, cy + 3.6, { align: 'center' });
  p.setFontSize(3.4);
  p.setTextColor(...t.colors.muted);
  p.text('- CERTIFICATE -', cx, cy + 8, { align: 'center' });

  // Bottom ribbon accent under the disc.
  p.setFillColor(...greenDeep);
  p.roundedRect(cx - 8, cy + r + 1.5, 16, 2.2, 1, 1, 'F');
}

// Measure how far below the signature line the tallest block (signature names +
// wrapped titles/designations) hangs. Used to anchor signatures above the footer
// band and to place the closing line clear of the signature images.
function measureSigBelow(p: any, list: CertSignatory[], sigCount: number, slotW: number): number {
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
  return maxBelow;
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
  const maxBelow = measureSigBelow(p, list, sigCount, slotW);

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
  const qrSize = 16;
  const extra = qrEnabled ? 0 : 6; // without QR we can drop the band closer to the edge
  return PAGE_H - FRAME_INNER - qrSize - 13 + extra - FOOTER_BAND_PAD;
}

async function drawFooter(p: any, t: CertTheme, data: CertPDFData, siteUrl: string) {
  const design = resolveDesign(t.design);
  const qrEnabled = design.qr.enabled !== false;
  const bandTop = footerBandTop(qrEnabled);
  const dateY = bandTop + FOOTER_BAND_PAD + 2;

  // Date — bottom left, smallest text, raw value with no formatting.
  p.setFont('helvetica', 'normal');
  p.setFontSize(4.8);
  p.setTextColor(...t.colors.muted);
  p.text(data.issuedAt || '', CONTENT_L + 2, dateY);

  // QR — bottom right, inside its reserved region (only when enabled).
  const qrSize = 16;
  const qrX = CONTENT_R - qrSize;
  const qrY = bandTop + FOOTER_BAND_PAD;

  if (!qrEnabled) return;

  const qrUrl = `${siteUrl}/clubs/preview/${data.certificateId}`;
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

  // ---- Decorative border (mirrors the PDF path) ----
  const green: [number, number, number] = [22, 139, 10];
  const greenDeep: [number, number, number] = [17, 110, 8];
  const stroke = (c: [number, number, number], w: number) => { ctx.strokeStyle = rgb(c); ctx.lineWidth = mmPx(w); };
  const rectMM = (x: number, y: number, w: number, h: number) => ctx.strokeRect(mmPx(x), mmPx(y), mmPx(w), mmPx(h));

  // Outer fine green frame.
  stroke(t.colors.border, 0.5); rectMM(FRAME + 0.6, FRAME + 0.6, PAGE_W - 2 * (FRAME + 0.6), PAGE_H - 2 * (FRAME + 0.6));
  // Inner double gold-accent lines.
  stroke(t.colors.borderAccent, 0.25); rectMM(FRAME_INNER + 1.4, FRAME_INNER + 1.4, PAGE_W - 2 * (FRAME_INNER + 1.4), PAGE_H - 2 * (FRAME_INNER + 1.4));
  stroke(t.colors.borderAccent, 0.18); rectMM(FRAME_INNER, FRAME_INNER, PAGE_W - 2 * FRAME_INNER, PAGE_H - 2 * FRAME_INNER);

  // Corner flowers (4-petal motif).
  if (t.border.cornerOrnaments) {
    const flower = (xmm: number, ymm: number) => {
      const x = mmPx(xmm), y = mmPx(ymm);
      const rr = mmPx(2.2);
      ctx.fillStyle = rgb(green);
      ctx.beginPath(); ctx.moveTo(x, y - rr); ctx.lineTo(x - rr * 0.7, y); ctx.lineTo(x, y + rr); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, y - rr); ctx.lineTo(x + rr * 0.7, y); ctx.lineTo(x, y + rr); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - rr, y); ctx.lineTo(x, y - rr * 0.7); ctx.lineTo(x, y + rr * 0.7); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - rr, y); ctx.lineTo(x, y - rr * 0.7); ctx.lineTo(x, y + rr * 0.7); ctx.closePath(); ctx.fill();
      stroke(t.colors.borderAccent, 0.3); ctx.beginPath(); ctx.arc(x, y, mmPx(1.1), 0, Math.PI * 2); ctx.stroke();
    };
    const d2 = 4.2;
    flower(FRAME_INNER + d2, FRAME_INNER + d2);
    flower(PAGE_W - FRAME_INNER - d2, FRAME_INNER + d2);
    flower(FRAME_INNER + d2, PAGE_H - FRAME_INNER - d2);
    flower(PAGE_W - FRAME_INNER - d2, PAGE_H - FRAME_INNER - d2);
  }

  // Bottom green band + deep accent.
  ctx.fillStyle = rgb(t.colors.primary);
  ctx.fillRect(mmPx(FRAME), mmPx(PAGE_H - FRAME_INNER - 4.5), mmPx(PAGE_W - 2 * FRAME), mmPx(4.5));
  ctx.fillStyle = rgb(greenDeep);
  ctx.fillRect(mmPx(FRAME), mmPx(PAGE_H - FRAME_INNER - 4.5), mmPx(PAGE_W - 2 * FRAME), mmPx(1));

  // ---- Top decoration (mirrors PDF drawTopDecoration) ----
  ctx.fillStyle = rgb(greenDeep); ctx.fillRect(mmPx(FRAME), mmPx(FRAME), mmPx(3), mmPx(3));
  ctx.fillStyle = rgb(green); ctx.fillRect(mmPx(PAGE_W - FRAME - 3), mmPx(FRAME), mmPx(3), mmPx(3));
  ctx.fillRect(mmPx(FRAME), mmPx(FRAME + 5), mmPx(2.2), mmPx(26));
  ctx.fillRect(mmPx(PAGE_W - FRAME - 2.2), mmPx(FRAME + 5), mmPx(2.2), mmPx(26));

  // ---- Header logos (club/org left, university right, aspect-ratio kept) ----
  {
    const drawCtx = (await import('./canvas-img')).drawCtx;
    const logoH = 14;
    const logoTop = FRAME_INNER + 3.5;
    const logoSlotW = 26;
    const fitLogo = async (url: string, rightAligned: boolean) => {
      if (rightAligned) {
        await drawCtx(ctx as any, url, C.contentR - mmPx(logoSlotW), logoTop * EXPORT_PX_PER_MM, mmPx(logoSlotW), mmPx(logoH), 1);
      } else {
        await drawCtx(ctx as any, url, CONTENT_L * EXPORT_PX_PER_MM, logoTop * EXPORT_PX_PER_MM, mmPx(logoSlotW), mmPx(logoH), 1);
      }
    };
    if (data.clubLogoUrl) await fitLogo(data.clubLogoUrl, false);
    if (data.iiucLogoUrl) await fitLogo(data.iiucLogoUrl, true);
  }

  // ---- Header (university + department, centered, small) ----
  const topHmm = CONTENT_TOP + 2.5;
  const centerWpx = C.contentW - mmPx(110);
  const centerLine = (text: string, pt: number, color: string, weight = 'bold', ff = 'Times New Roman', italic = false, baselineMm: number, minPt: number): number => {
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    let s = pt * PT_MM * EXPORT_PX_PER_MM;
    ctx.font = font(ff, weight, s, italic);
    while (s > minPt * PT_MM * EXPORT_PX_PER_MM && ctx.measureText(text).width > centerWpx) {
      s -= 0.25 * PT_MM * EXPORT_PX_PER_MM;
      ctx.font = font(ff, weight, s, italic);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, C.cx, mmPx(baselineMm));
    return s / (PT_MM * EXPORT_PX_PER_MM);
  };

  let baseMm = topHmm + fontAscent(9.5);
  let sizePt = centerLine(d.text.institutionName || 'INTERNATIONAL ISLAMIC UNIVERSITY CHITTAGONG', 9.5, rgb(t.colors.primary), 'bold', 'Times New Roman', false, baseMm, 6);
  if (data.department) {
    baseMm += linePitch(sizePt, 7.5);
    sizePt = centerLine(`Department of ${data.department}`, 7.5, rgb(t.colors.text), 'bold', 'Times New Roman', false, baseMm, 5.5);
  }

  const hdrRuleY = mmPx(baseMm + fontDescent(sizePt) + 2.6);
  ctx.strokeStyle = rgb(t.colors.secondary); ctx.lineWidth = 0.25 * EXPORT_PX_PER_MM;
  ctx.beginPath(); ctx.moveTo(C.cx - mmPx(60), hdrRuleY); ctx.lineTo(C.cx + mmPx(60), hdrRuleY); ctx.stroke();
  ctx.fillStyle = rgb(t.colors.secondary); ctx.beginPath(); ctx.arc(C.cx, hdrRuleY, 0.6 * EXPORT_PX_PER_MM, 0, Math.PI * 2); ctx.fill();
  const headerBottomMm = baseMm + fontDescent(sizePt) + 2.6 + 1.4;

  // ---- Title: CERTIFICATE + OF ACHIEVEMENT ----
  const line2d = (x0: number, y0: number, x1: number, y1: number) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const titleText = d.text.mainTitle || 'CERTIFICATE';
  const titlePt = d.fonts.titleFontSize || 26;
  const titleBaseMm = headerBottomMm + 4.5 + fontAscent(titlePt);
  let tsize = titlePt * PT_MM * EXPORT_PX_PER_MM;
  ctx.font = font('Times New Roman', 'bold', tsize);
  while (tsize > 16 * PT_MM * EXPORT_PX_PER_MM && ctx.measureText(titleText).width > C.contentW - mmPx(90)) {
    tsize -= 0.5 * PT_MM * EXPORT_PX_PER_MM;
    ctx.font = font('Times New Roman', 'bold', tsize);
  }
  const titleUsedPt = tsize / (PT_MM * EXPORT_PX_PER_MM);
  ctx.fillStyle = rgb(t.colors.primary);
  ctx.fillText(titleText, C.cx, mmPx(titleBaseMm));

  // Embellishment row (short rule + central diamond).
  const decoY = mmPx(titleBaseMm + fontDescent(titleUsedPt) + 1.6);
  ctx.strokeStyle = rgb(t.colors.secondary); ctx.lineWidth = 0.3 * EXPORT_PX_PER_MM;
  line2d(C.cx - mmPx(16), decoY, C.cx - mmPx(2.5), decoY);
  line2d(C.cx + mmPx(2.5), decoY, C.cx + mmPx(16), decoY);
  ctx.fillStyle = rgb(t.colors.secondary);
  ctx.beginPath(); ctx.moveTo(C.cx, decoY - mmPx(1.2)); ctx.lineTo(C.cx - mmPx(1.2), decoY); ctx.lineTo(C.cx, decoY + mmPx(1.2)); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(C.cx - mmPx(1.2), decoY); ctx.lineTo(C.cx, decoY - mmPx(1.2)); ctx.lineTo(C.cx, decoY + mmPx(1.2)); ctx.closePath(); ctx.fill();

  // Subtitle, letter-spaced, ink.
  const subPt = d.fonts.subtitleFontSize || 10;
  const subBaseMm = titleBaseMm + fontDescent(titleUsedPt) + 1.6 + 2.6 + fontAscent(subPt);
  const subtitle = (d.text.subtitle || t.title?.subtitle || 'OF ACHIEVEMENT').toUpperCase();
  const subPx = subPt * PT_MM * EXPORT_PX_PER_MM;
  ctx.font = font('Times New Roman', 'bold', subPx);
  ctx.fillStyle = `rgb(23,23,23)`;
  const charSp = (d.fonts.titleLetterSpacing != null ? d.fonts.titleLetterSpacing : 3.2) * PT_MM * EXPORT_PX_PER_MM;
  let sx = C.cx - (ctx.measureText(subtitle).width + charSp * (subtitle.length - 1)) / 2;
  for (const ch of subtitle) {
    ctx.fillText(ch, sx + ctx.measureText(ch).width / 2, mmPx(subBaseMm));
    sx += ctx.measureText(ch).width + charSp;
  }

  // ---- Intro + name + body + closing ----
  const bodyStartMm = subBaseMm + fontDescent(subPt) + 3.6;
  const introBaseMm = bodyStartMm + 2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = font('Times New Roman', 'normal', (d.fonts.bodySize || 9.5) * PT_MM * EXPORT_PX_PER_MM);
  ctx.fillStyle = rgb(t.colors.text);
  const intro = d.text.intro || 'This is to certify that';
  ctx.save(); ctx.letterSpacing = '1.4px'; ctx.fillText(intro, C.cx, mmPx(introBaseMm)); ctx.restore();
  const introBottomMm = introBaseMm + fontDescent(9.5);

  // recipient name — script font with serif fallback
  const name = data.memberName.trim();
  const nameSizePt = d.fonts.nameSize || 20;
  const nameLarge = name.toUpperCase();
  const nameTopMm = introBottomMm + 2.8;
  const nameBottomMm = nameTopMm + 10.5;
  const nameBasePx = mmPx(nameBottomMm - 1.2);
  let shownAsScript = false;
  try {
    await loadGoogleFonts();
    if (document.fonts && typeof document.fonts.load === 'function') await document.fonts.load(`40px "${d.fonts.nameScriptFont || 'Great Vibes'}"`);
    ctx.font = font(d.fonts.nameScriptFont || 'Great Vibes', 'normal', nameSizePt * 1.15 * PT_MM * EXPORT_PX_PER_MM);
    const nw = ctx.measureText(name).width;
    const maxNW = C.contentW - mmPx(60);
    if (nw <= maxNW) { ctx.fillStyle = rgb(t.colors.primary); ctx.fillText(name, C.cx, nameBasePx); shownAsScript = true; }
  } catch {}
  if (!shownAsScript) {
    let s = nameSizePt * PT_MM * EXPORT_PX_PER_MM;
    ctx.font = font('Times New Roman', 'bold', s);
    while (s > 10 * PT_MM * EXPORT_PX_PER_MM && ctx.measureText(nameLarge).width > C.contentW - mmPx(60)) { s -= 0.5 * PT_MM * EXPORT_PX_PER_MM; ctx.font = font('Times New Roman', 'bold', s); }
    ctx.fillStyle = rgb(t.colors.primary); ctx.fillText(nameLarge, C.cx, nameBasePx);
  }

  // underline
  const underlineYmm = nameBottomMm + 1.6;
  ctx.font = font('Times New Roman', 'bold', nameSizePt * PT_MM * EXPORT_PX_PER_MM);
  const nameW = Math.min(ctx.measureText(nameLarge).width + mmPx(18), C.contentW - mmPx(60) + mmPx(12));
  const uyPx = mmPx(underlineYmm);
  ctx.strokeStyle = rgb(t.colors.secondary); ctx.lineWidth = 0.35 * EXPORT_PX_PER_MM;
  line2d(C.cx - nameW / 2, uyPx, C.cx + nameW / 2, uyPx);
  ctx.fillStyle = rgb(t.colors.secondary);
  ctx.beginPath(); ctx.arc(C.cx - nameW / 2, uyPx, 0.7 * EXPORT_PX_PER_MM, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(C.cx + nameW / 2, uyPx, 0.7 * EXPORT_PX_PER_MM, 0, Math.PI * 2); ctx.fill();

  const bodyFirstBaseMm = underlineYmm + 6.6;

  // body paragraphs
  const paragraphs: string[] = [];
  if (data.eventName) paragraphs.push(`In recognition of your active participation in the event "${data.eventName}"`);
  if (data.post && data.clubName) paragraphs.push(`for your distinguished service and sincere contribution as ${data.post} of ${data.clubName} in strengthening the activities of our club and department, throughout ${data.servicePeriod || data.session || 'your tenure'}.`);
  else if (data.clubName) paragraphs.push(`for your sincere service and active contribution as a member of ${data.clubName}, throughout ${data.servicePeriod || data.session || 'your tenure'}.`);
  else paragraphs.push('for your sincere service, dedication, and invaluable contribution to our organization.');
  const recText = getRoleRecognition(data.post || '') ? `We sincerely appreciate your ${getRoleRecognition(data.post || '')}.` : '';

  const maxWmm = CONTENT_W - 30;
  const wrapTexLimit = (text: string, sizePt2: number, maxW: number, maxLines: number): string[] => {
    const s = sizePt2 * PT_MM * EXPORT_PX_PER_MM;
    ctx.font = font('Times New Roman', 'normal', s);
    const words = text.split(' ');
    const lines: string[] = []; let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > mmPx(maxW) && line) {
        lines.push(line); line = w;
        if (lines.length >= maxLines) return lines;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  };

  // Closing line ceiling (mirrors PDF orchestration) — body content must end
  // before reserved room for "THANK YOU…" + signatures/footer.
  const qrOn = d.qr.enabled !== false;
  const bandTopMm = footerBandTop(qrOn);
  let closingMaxMm = bandTopMm - 4;
  const sigs = (data.signatories || []).filter(s => s.name && s.name.trim());
  if (sigs.length > 0) {
    const sigCount = Math.min(sigs.length, 3);
    const slotWmm = sigCount === 1 ? 80 : 54;
    let maxBelowMM = 3.4 + 3.6;
    for (let i = 0; i < sigCount; i++) {
      const sig = sigs[i];
      let below = 3.4 + 3.6;
      const metas = [];
      if (sig.title) metas.push(sig.title);
      if (sig.designation) metas.push(sig.designation);
      for (const m of metas) below += wrapTexLimit(m, 6, slotWmm - 2, 99).length * 3.2;
      if (below > maxBelowMM) maxBelowMM = below;
    }
    const sigImgH = sigs.some(s => s.signatureUrl || s.autoSignature !== false) ? 11 : 0;
    closingMaxMm = (bandTopMm - 2 - maxBelowMM) - sigImgH - 1 - 2.5;
  }

  const lhMm = (pt: number) => pt * 0.62;
  const bodyHmm = (k: number) => {
    let total = 0;
    for (const seg of paragraphs) total += wrapTexLimit(seg, k, maxWmm, 3).length * lhMm(k) + 1.2;
    if (recText) {
      const rSize = Math.min(k + 0.5, 8.5);
      total += wrapTexLimit(recText, rSize, maxWmm - 10, 2).length * lhMm(rSize) + 1.4;
    }
    return total;
  };

  const availMm = closingMaxMm - 6 - bodyFirstBaseMm;
  const bodyStartSize = d.fonts.bodySize || 9.5;
  let chosenK = bodyStartSize;
  for (let k = bodyStartSize; k >= 7.25; k -= 0.25) {
    chosenK = k;
    if (bodyHmm(k) <= availMm) break;
  }

  let yMm = bodyFirstBaseMm;
  ctx.fillStyle = rgb(t.colors.text); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (const seg of paragraphs) {
    for (const line of wrapTexLimit(seg, chosenK, maxWmm, 3)) {
      ctx.font = font('Times New Roman', 'normal', chosenK * PT_MM * EXPORT_PX_PER_MM);
      ctx.fillText(line, C.cx, mmPx(yMm));
      yMm += lhMm(chosenK);
    }
    yMm += 1.2;
  }
  if (recText) {
    const rSize = Math.min(chosenK + 0.5, 8.5);
    ctx.fillStyle = rgb(t.colors.muted);
    for (const line of wrapTexLimit(recText, rSize, maxWmm - 10, 2)) {
      ctx.font = font('Times New Roman', 'normal', rSize * PT_MM * EXPORT_PX_PER_MM, true);
      ctx.fillText(line, C.cx, mmPx(yMm));
      yMm += lhMm(rSize);
    }
  }

  // closing — always drawn, clamped above the signature / footer area
  const closBaseMm = Math.min(yMm + 2.5, closingMaxMm);
  const closingSizePx = 7.5 * PT_MM * EXPORT_PX_PER_MM;
  ctx.font = font('Helvetica', 'bold', closingSizePx); ctx.fillStyle = rgb(t.colors.secondary);
  ctx.fillText(d.text.closing || 'THANK YOU FOR YOUR VALUABLE CONTRIBUTION', C.cx, mmPx(closBaseMm));

  // ---- Footer band ----
  const bandTopPx = mmPx(footerBandTop(qrOn));
  const footDateY = mmPx(footerBandTop(qrOn) + FOOTER_BAND_PAD + 2);
  ctx.font = font('Helvetica', 'normal', 4.8 * EXPORT_PX_PER_MM); ctx.textAlign = 'left'; ctx.fillStyle = rgb(t.colors.muted);
  ctx.fillText(data.issuedAt || '', C.contentL + mmPx(2), footDateY);

  // ---- Best-award seal (clean medal on the right, no logos) ----
  {
    const cx = mmPx(SEAL_CX), cy = mmPx(SEAL_CY), r = mmPx(SEAL_D / 2);
    // Outer green disc.
    ctx.fillStyle = rgb(green); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    // Cream inner disc.
    ctx.fillStyle = rgb(t.colors.background); ctx.beginPath(); ctx.arc(cx, cy, r - mmPx(3), 0, Math.PI * 2); ctx.fill();
    // Ink ring.
    stroke(greenDeep, 0.5); ctx.beginPath(); ctx.arc(cx, cy, r - mmPx(5.6), 0, Math.PI * 2); ctx.stroke();
    // "BEST AWARD" centered.
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = font('Times New Roman', 'bold', 6.5 * EXPORT_PX_PER_MM); ctx.fillStyle = rgb(greenDeep);
    ctx.fillText('BEST', cx, cy - mmPx(2));
    ctx.fillText('AWARD', cx, cy + mmPx(3.6));
    ctx.font = font('Times New Roman', 'normal', 3.4 * EXPORT_PX_PER_MM); ctx.fillStyle = rgb(t.colors.muted);
    ctx.fillText('- CERTIFICATE -', cx, cy + mmPx(8));
    // Ribbon accent under the disc.
    ctx.fillStyle = rgb(greenDeep);
    ctx.beginPath(); ctx.roundRect(cx - mmPx(8), cy + r + mmPx(1.5), mmPx(16), mmPx(2.2), mmPx(1)); ctx.fill();
  }

  // ---- Signatures ----
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
    // Anchored by measured meta height (mirrors the PDF path) so the block
    // always sits clear above the footer band.
    let maxBelowMM = 3.4 + 3.6;
    for (let i = 0; i < sigCount; i++) {
      let below = 3.4 + 3.6;
      const metas: string[] = [];
      if (sigs[i].title) metas.push(sigs[i].title);
      if (sigs[i].designation) metas.push(sigs[i].designation);
      for (const m of metas) below += wrapTexLimit(m, 6, slotWmm - 2, 99).length * 3.2;
      if (below > maxBelowMM) maxBelowMM = below;
    }
    const lineY = bandTopPx - mmPx(2) - mmPx(maxBelowMM);
    const sigImgHmm = sigs.some(s => s.signatureUrl || s.autoSignature !== false) ? 11 : 0;
    for (let i = 0; i < sigCount; i++) {
      const sig = sigs[i];
      const x = C.cx + (slots[i] - CX) * EXPORT_PX_PER_MM; // px center from mm offset
      const slotW = slotWmm * EXPORT_PX_PER_MM;
      // line
      if (d.signatureLine.enabled !== false) {
        ctx.strokeStyle = rgb(d.signatureLine.color || t.colors.muted);
        ctx.lineWidth = (d.signatureLine.thickness || 0.28) * EXPORT_PX_PER_MM;
        line2d(x - slotW / 2, lineY, x + slotW / 2, lineY);
      }
      // signature image
      if (sig.signatureUrl || sig.autoSignature !== false) {
        let url = sig.signatureUrl;
        if (!url && sig.autoSignature !== false && sig.name) {
          const { generateSignatureDataURL } = await import('./signature-gen');
          try { url = await generateSignatureDataURL(sig.name, 220, 60); } catch {}
        }
        if (url) { const img = await canvasLoadImage(url); if (img) ctx.drawImage(img, x - slotW / 2, lineY - mmPx(sigImgHmm + 1), slotW, mmPx(sigImgHmm)); }
      }
      const textY = lineY + mmPx(3.4);
      ctx.textAlign = 'center';
      let ns = 7.5 * PT_MM * EXPORT_PX_PER_MM;
      ctx.font = font('Times New Roman', 'bold', ns);
      while (ns > 5 * PT_MM * EXPORT_PX_PER_MM && ctx.measureText(sig.name.toUpperCase()).width > slotW - mmPx(6)) { ns -= 0.2 * PT_MM * EXPORT_PX_PER_MM; ctx.font = font('Times New Roman', 'bold', ns); }
      ctx.fillStyle = rgb(t.colors.text); ctx.fillText(sig.name.toUpperCase(), x, textY);
      let py = textY + mmPx(3.6);
      const metaLines: string[] = [];
      if (sig.title) metaLines.push(sig.title);
      if (sig.designation) metaLines.push(sig.designation);
      ctx.fillStyle = rgb(t.colors.muted);
      for (const meta of metaLines) {
        for (const wl of wrapTexLimit(meta, 6, slotWmm - 2, 99)) {
          ctx.fillText(wl, x, py); py += mmPx(3.2);
        }
      }
    }
  }

  // ---- QR ----
  if (qrOn) {
    const { default: QRCode } = await import('qrcode');
    try {
      const qrUrl = `${data.siteUrl || 'https://iiuc-arms.eu.cc'}/clubs/preview/${data.certificateId}`;
      const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 200, margin: 1, errorCorrectionLevel: 'H', color: { dark: '#1a1a2e', light: '#ffffff' } });
      const qrSize = 16 * EXPORT_PX_PER_MM;
      const qrX = C.contentR - qrSize, qrY = bandTopPx + mmPx(FOOTER_BAND_PAD);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(qrX - mmPx(1.5), qrY - mmPx(1.5), qrSize + mmPx(3), qrSize + mmPx(3));
      ctx.strokeStyle = rgb(t.colors.secondary); ctx.lineWidth = 0.3 * EXPORT_PX_PER_MM;
      const r2 = mmPx(1.5);
      ctx.beginPath(); ctx.roundRect(qrX - mmPx(1.5), qrY - mmPx(1.5), qrSize + mmPx(3), qrSize + mmPx(3), r2); ctx.stroke();
      const qrImg = await canvasLoadImage(qrDataUrl);
      if (qrImg) ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    } catch {}
  }

  return canvas.toDataURL('image/png');
}

export async function exportCertificateImage(
  data: CertPDFData,
  format: 'png' | 'jpeg' = 'png',
  widthPx?: number,
): Promise<string> {
  const png = await renderCertificateCanvas(data);
  const w = widthPx && widthPx > 0 && widthPx < EXPORT_W_PX ? widthPx : EXPORT_W_PX;
  const h = Math.round(w * (EXPORT_H_PX / EXPORT_W_PX));
  if (format === 'png') {
    if (w === EXPORT_W_PX) return png;
    const img = await canvasLoadImage(png);
    if (!img) throw new Error('Canvas export requires a browser');
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    ctx.drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/png');
  }
  const img = await canvasLoadImage(png);
  if (!img || typeof document === 'undefined') throw new Error('JPG export requires a browser');
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
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

  const design = resolveDesign(t.design);
  const qrEnabled = design.qr.enabled !== false;
  const bandTop = footerBandTop(qrEnabled);

  const signatories = (data.signatories || []).filter(s => s.name && s.name.trim());

  // Pre-measure the signature block so the body/closing have a hard ceiling and
  // can never overlap the signature area or the footer band.
  let closingMax = bandTop - 4;
  if (signatories.length > 0) {
    const sigCount = Math.min(signatories.length, 3);
    const slotW = sigCount === 1 ? 80 : 54;
    const maxBelow = measureSigBelow(pdf, signatories.slice(0, sigCount), sigCount, slotW);
    const sigImgH = signatories.some(s => s.signatureUrl || s.autoSignature !== false) ? 11 : 0;
    const lineY = bandTop - 2 - maxBelow;
    const sigImgTop = lineY - sigImgH - 1;
    closingMax = sigImgTop - 2.5;
  }

  const headerBottom = drawHeader(pdf, t, data, logos);

  const titleEnd = drawTitle(pdf, t, headerBottom);

  const bodyBottom = await drawBody(pdf, t, data, titleEnd + 3, closingMax);

  // Closing line always drawn, and always above the signature / footer area.
  const closBase = Math.min(bodyBottom + 2, closingMax);
  drawClosing(pdf, t, closBase);

  // Best-award seal (right side).
  drawSeal(pdf, t);

  if (signatories.length > 0) {
    await drawSignatures(pdf, t, signatories, closBase, bandTop);
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
