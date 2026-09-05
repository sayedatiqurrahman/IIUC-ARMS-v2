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

// Decorative border — fine inner frame, green bar, bottom-left squares,
// stripe circle and concentric arcs matching certificate.html.
function drawBorder(p: any, t: CertTheme) {
  const green: [number, number, number] = [22, 139, 10];
  const purple: [number, number, number] = [133, 0, 168];

  // Inner frame (thin decorative border inside the content area).
  p.setDrawColor(...green);
  p.setLineWidth(0.12);
  p.rect(12, 12, PAGE_W - 24, PAGE_H - 24, 'S');

  // Side ribbons — thin green strips + short blocks on the left/right edges.
  p.setFillColor(...green);
  p.rect(12, 85, 1, 62, 'F');
  p.rect(PAGE_W - 13, 85, 1, 62, 'F');
  p.setFillColor(...green);
  p.rect(12, 85, 40, 22, 'F');
  p.rect(PAGE_W - 52, 85, 40, 22, 'F');

  // Bottom green bar — full width at the very bottom (50px in the reference).
  p.setFillColor(...green);
  p.rect(0, PAGE_H - 13.3, PAGE_W, 13.3, 'F');

  // Bottom-left decorative squares (certificate.html bottom-[99/144/72] blocks).
  p.setFillColor(59, 157, 40); // #3b9d28
  p.rect(21.75, 169.2, 14.06, 14.06, 'F');
  p.setFillColor(...green);
  p.rect(31.82, 159.9, 11.4, 11.4, 'F');
  p.setFillColor(...purple);
  p.rect(37.66, 178.0, 12.47, 12.47, 'F');

  // Diagonal-stripe circle (certificate.html .stripe-circle, 75px round).
  // Drawn as chords of each 45° stripe line that fall inside the circle —
  // avoids jsPDF clip support quirks. Spacing = 3.38mm (9px), width 1.06mm (4px).
  p.setDrawColor(166, 211, 162); // 38% green over white
  p.setLineWidth(1.06);
  const ssR = 9.95;
  const ssSum = 223.4 + 175.15;
  for (let s = 384.5; s <= 412.7; s += 3.38) {
    const d = s - ssSum;
    if (Math.abs(d) >= ssR * Math.SQRT2) continue;
    const h = Math.sqrt(ssR * ssR - (d * d) / 2);
    const fx = 223.4 + d / 2;
    const fy = 175.15 + d / 2;
    p.line(fx + h / Math.SQRT2, fy - h / Math.SQRT2, fx - h / Math.SQRT2, fy + h / Math.SQRT2);
  }

  // Bottom-right concentric arcs (certificate.html bottom-[-152]/[-119] rings).
  // Outer green ring + white interior.
  p.setFillColor(255, 255, 255);
  p.circle(281.0, 203.2, 47.08, 'F');
  p.setDrawColor(...green);
  p.setLineWidth(15.38);
  p.circle(281.0, 203.2, 39.39, 'S');
  // Inner purple ring + white interior.
  p.setFillColor(255, 255, 255);
  p.circle(289.9, 212.9, 28.64, 'F');
  p.setDrawColor(...purple);
  p.setLineWidth(7.96);
  p.circle(289.9, 212.9, 24.66, 'S');
}

// Purple geometric accents at the top-left corner — large rounded purple
// rectangle with smaller green/purple squares, matching the certificate.html design.
function drawTopDecoration(p: any) {
  const purple: [number, number, number] = [133, 0, 168];
  const green: [number, number, number] = [22, 139, 10];

  // Large purple rounded-bottom rectangle at top-left (top corners hidden above
  // the page edge so only the bottom reads as rounded).
  p.setFillColor(...purple);
  p.roundedRect(16, -20, 27, 60, 13, 13, 'F');

  // Small purple square at top-right area.
  p.setFillColor(...purple);
  p.rect(PAGE_W - 33, 0, 18, 18, 'F');

  // Green square below the purple one.
  p.setFillColor(...green);
  p.rect(PAGE_W - 46, 14, 13, 13, 'F');

  // Smaller green square further down.
  p.setFillColor(...green);
  p.rect(PAGE_W - 36, 28, 9, 9, 'F');
}

// The reference design drops the university banner at the top; the header
// reduces to the top decorative strip plus a modest university line. Logos live
// in the circular award seals drawn separately (see drawSeal).
function drawHeader(p: any, t: CertTheme, data: CertPDFData): number {
  const design = resolveDesign(t.design);
  drawTopDecoration(p);

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
  // Body text is kept narrower than the full width so it clears the award seals.
  const maxWidth = SEAL_BODY_W;

  // ── Fixed intro + recipient name + underline block ──
  const introBase = startY + 2;
  setStyle(p, 'serif', 'normal', design.fonts.bodySize || 9.5, textColor);
  p.setCharSpace(1.4);
  p.text(design.text.intro || 'This is to certify that', CX, introBase, { align: 'center' });
  p.setCharSpace(0);
  const introBottom = introBase + fontDescent(9.5);

  const name = data.memberName.trim();
  const nameMaxW = SEAL_BODY_W - 12;
  const nameTop = introBottom + 2.8;
  const nameBottom = nameTop + 10.5;
  const nameBase = nameBottom - 1.2;
  const serifName = () => {
    setStyle(p, 'serif', 'bold', design.fonts.nameSize || 20, primary);
    p.text(name.toUpperCase(), CX, nameBase, { align: 'center' });
  };

  // Same renderer as the canvas/PNG path so the PDF name is identical in size,
  // shape and baseline — never stretched into a fixed box.
  const nm = await renderNameImage(name, design, primary);
  if (nm && nm.dataUrl) {
    try {
      await p.addImage(nm.dataUrl, 'PNG', CX - nm.widthMm / 2, nameBase - nm.baselineFromTopMm, nm.widthMm, nm.heightMm);
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
  const startSize = (design.fonts.bodySize || 9.5) + 1.2;
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

// ── Award seals ────────────────────────────────────────────────────────────
// Two circular seals (like certificate.html) — university logo on the left,
// club logo on the right. Each has a green outer ring, white ring, ink inner
// ring and the logo centered on white.
const SEAL_D = 40;               // seal outer diameter (mm)
const SEAL_CX_L = 42;            // left seal — at the left side of the certificate
const SEAL_CX_R = PAGE_W - 42;   // right seal — mirrored at the right side
const SEAL_CY = 99;              // both seals vertically centred
const SEAL_BODY_W = 162;         // centred body text width that stays clear of seals

// Safety gap (mm) between the logo corners and the inner ink ring so the logo
// never touches the circle border (≈ 2px+ at export scale).
const SEAL_LOGO_PAD = 0.8;

// Fit a logo inside the seal's inner circle: corners land exactly on the
// (photoR − pad) circle so nothing crosses the ink ring, aspect ratio preserved.
function fitLogoInCircle(ratio: number, photoR: number, pad: number): { w: number; h: number } {
  const availR = photoR - pad;
  const w = (2 * availR * ratio) / Math.sqrt(1 + ratio * ratio);
  const h = w / ratio;
  return { w, h };
}

async function drawSeal(p: any, t: CertTheme, logos: { iiuc?: string; club?: string }, label?: string) {
  const green: [number, number, number] = [22, 139, 10];
  const greenDeep: [number, number, number] = [17, 110, 8];
  const r = SEAL_D / 2;

  const drawOne = async (cx: number, url?: string, sub?: string) => {
    // Outer green ring.
    p.setFillColor(...green);
    p.circle(cx, SEAL_CY, r, 'F');

    // White ring divider.
    p.setFillColor(255, 255, 255);
    p.circle(cx, SEAL_CY, r - 3, 'F');

    // Ink inner ring.
    p.setDrawColor(...greenDeep);
    p.setLineWidth(0.5);
    p.circle(cx, SEAL_CY, r - 5.2, 'S');

    // Inner photo area.
    p.setFillColor(255, 255, 255);
    p.circle(cx, SEAL_CY, r - 5.2, 'F');

    // Logo fitted inside the inner circle (aspect preserved, corner-safe).
    if (url) {
      try {
        const info = p.getImageProperties(url);
        const { w, h } = fitLogoInCircle(info.width / info.height, r - 5.2, SEAL_LOGO_PAD);
        await p.addImage(url, 'PNG', cx - w / 2, SEAL_CY - h / 2, w, h);
      } catch {}
    }

    // Small caption under the ring.
    if (sub) {
      p.setFont('times', 'bold');
      let s = 4.2;
      p.setFontSize(s);
      while (s > 2.6 && p.getTextWidth(sub) > r * 1.8) { s -= 0.2; p.setFontSize(s); }
      p.setTextColor(...t.colors.muted);
      p.text(sub, cx, SEAL_CY + r + 3.6, { align: 'center' });
    }
  };

  await drawOne(SEAL_CX_L, logos.iiuc, label || 'UNIVERSITY');
  await drawOne(SEAL_CX_R, logos.club);
}

// Measure how far below the signature line the tallest block (signature names +
// wrapped titles/designations) hangs. Used to anchor signatures above the footer
// band and to place the closing line clear of the signature images.
const SIG_META_PT = 7;   // role/designation size under the signature name
const SIG_META_PITCH = 3.4;
function measureSigBelow(p: any, list: CertSignatory[], sigCount: number, slotW: number): number {
  let maxBelow = 0;
  for (let i = 0; i < sigCount; i++) {
    const sig = list[i];
    let below = 3.4 + 3.6; // name baseline offset + gap to meta
    const metaLines: string[] = [];
    if (sig.title) metaLines.push(sig.title);
    if (sig.designation) metaLines.push(sig.designation);
    for (const m of metaLines) {
      p.setFont('times', 'bold');
      p.setFontSize(SIG_META_PT);
      const wrapped = p.splitTextToSize(m.toUpperCase(), slotW - 2) as string[];
      below += Math.max(Array.isArray(wrapped) ? wrapped.length : 1, 1) * SIG_META_PITCH;
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

  const slotW = sigCount === 1 ? 80 : sigCount === 2 ? 54 : 54;
  let slots: number[];
  if (sigCount === 1) {
    slots = [CX];
  } else if (sigCount === 2) {
    slots = [CX - 58, CX + 58];
  } else {
    // Three slots spread across the full content width.
    const gap = ((CONTENT_R - 4) - (CONTENT_L + 4) - slotW * sigCount) / (sigCount - 1);
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

  // Anchor the signature line close to the closing text, but never let the
  // block drop into the QR/footer-band reserved region.
  const safeBottom = footBandTop - 2;
  const targetLine = safeBottom - maxBelow;
  const lineY = Math.min(targetLine, Math.max(topY + 6, topY + 17));

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
        const { generateSignatureDataURL, signatureTextFor } = await import('./signature-gen');
        try { sigDataUrl = await generateSignatureDataURL(signatureTextFor(sig), 220, 60); } catch {}
      }
      if (sigDataUrl) {
        try {
          await p.addImage(sigDataUrl, 'PNG', x - slotW / 2, lineY - sigImgH - 1, slotW, sigImgH);
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

    // Title / designation block (wrapped, uppercase).
    const metaLines: string[] = [];
    if (sig.title) metaLines.push(sig.title);
    if (sig.designation) metaLines.push(sig.designation);
    for (let mi = 0; mi < metaLines.length; mi++) {
      const m = metaLines[mi].toUpperCase();
      p.setFont('times', mi === 0 ? 'bold' : 'normal');
      let mSize = SIG_META_PT;
      p.setFontSize(mSize);
      while (mSize > 4.5 && p.getTextWidth(m) > slotW - 2) { mSize -= 0.2; p.setFontSize(mSize); }
      const wrapped = p.splitTextToSize(m, slotW - 2) as string[];
      for (const wl of wrapped) {
        p.setTextColor(...(mi === 0 ? t.colors.text : t.colors.muted));
        p.text(wl, x, py, { align: 'center' });
        py += SIG_META_PITCH;
      }
    }
  }

  return lineY - sigImgH - 1;
}

// Footer band geometry shared between the signature section and the footer row.
// The QR sits centred at the bottom; signatures stay clear of it vertically.
const FOOTER_BAND_PAD = 2;
const QR_SIZE_MM = 22; // large enough for any scanner to read (≈20mm+ recommended)
function footerBandTop(qrEnabled = true): number {
  const extra = qrEnabled ? 0 : 6; // without QR we can drop the band closer to the edge
  return PAGE_H - FRAME_INNER - QR_SIZE_MM - 13 + extra - FOOTER_BAND_PAD; // ≈ 161
}

async function drawFooter(p: any, t: CertTheme, data: CertPDFData, siteUrl: string) {
  const design = resolveDesign(t.design);
  const qrEnabled = design.qr.enabled !== false;
  const bandTop = footerBandTop(qrEnabled);

  // QR — centred at the bottom, above the green bar (keeps the bottom-right
  // corner free for the award arcs from the reference design).
  const qrSize = QR_SIZE_MM;
  const qrX = CX - qrSize / 2;
  const qrY = bandTop;

  if (!qrEnabled) return;

  const qrUrl = `${siteUrl}/clubs/preview/${data.certificateId}`;
  let qrDataUrl: string | undefined;
  try {
    qrDataUrl = await QRCode.toDataURL(qrUrl, {
      width: 640,
      margin: 4,
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
    try { await p.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize); } catch {}
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

// Shared recipient-name renderer. Draws the script name (with a serif fallback
// for long names) at the same physical size and baseline used by the old canvas
// path, then returns a cropped raster + its size in mm so BOTH the PDF and the
// PNG/export can place identical glyphs at identical coordinates.
async function renderNameImage(
  name: string,
  design: any,
  primary: [number, number, number] | number[],
): Promise<{ dataUrl: string; widthMm: number; heightMm: number; baselineFromTopMm: number } | null> {
  if (typeof document === 'undefined') return null;
  await loadGoogleFonts();

  const scriptFont = design.fonts.nameScriptFont || 'Great Vibes';
  const nameSizePt = design.fonts.nameSize || 20;
  const nameLarge = name.toUpperCase();
  const maxWmm = SEAL_BODY_W - 12;
  const canvasHmm = 14;
  const baselineHmm = 12;

  const W = Math.round(maxWmm * EXPORT_PX_PER_MM);
  const H = Math.round(canvasHmm * EXPORT_PX_PER_MM);
  const baselineY = Math.round(baselineHmm * EXPORT_PX_PER_MM);
  const ptPx = (pt: number) => pt * PT_MM * EXPORT_PX_PER_MM;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const ink = `rgb(${primary[0]},${primary[1]},${primary[2]})`;
  let drawn = false;
  try {
    if (document.fonts && typeof document.fonts.load === 'function') {
      await document.fonts.load(`40px "${scriptFont}"`);
    }
    ctx.font = `${ptPx(nameSizePt * 1.15)}px "${scriptFont}", cursive, serif`;
    drawn = ctx.measureText(name).width <= W;
    if (drawn) {
      ctx.fillStyle = ink;
      ctx.fillText(name, W / 2, baselineY);
    }
  } catch {}
  if (!drawn) {
    let s = ptPx(nameSizePt);
    ctx.font = `bold ${s}px "Times New Roman", Times, serif`;
    while (s > ptPx(10) && ctx.measureText(nameLarge).width > W) {
      s -= ptPx(0.5);
      ctx.font = `bold ${s}px "Times New Roman", Times, serif`;
    }
    ctx.fillStyle = ink;
    ctx.fillText(nameLarge, W / 2, baselineY);
  }

  const imgData = ctx.getImageData(0, 0, W, H);
  let minX = W, minY = H, maxX = 0, maxY = 0;
  const d = imgData.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX <= minX || maxY <= minY) return null;

  const pad = Math.round(1.5 * EXPORT_PX_PER_MM);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(W, maxX + pad);
  maxY = Math.min(H, maxY + pad);
  const w = maxX - minX;
  const h = maxY - minY;
  const cropped = document.createElement('canvas');
  cropped.width = w;
  cropped.height = h;
  const cctx = cropped.getContext('2d');
  if (!cctx) return null;
  cctx.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);

  return {
    dataUrl: cropped.toDataURL('image/png'),
    widthMm: w / EXPORT_PX_PER_MM,
    heightMm: h / EXPORT_PX_PER_MM,
    baselineFromTopMm: (baselineY - minY) / EXPORT_PX_PER_MM,
  };
}

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
  const purple: [number, number, number] = [133, 0, 168];
  const stroke = (c: [number, number, number], w: number) => { ctx.strokeStyle = rgb(c); ctx.lineWidth = mmPx(w); };
  const rectMM = (x: number, y: number, w: number, h: number) => ctx.strokeRect(mmPx(x), mmPx(y), mmPx(w), mmPx(h));
  const fillRectMM = (x: number, y: number, w: number, h: number, c?: [number, number, number]) => {
    ctx.fillStyle = c ? rgb(c) : '#000'; ctx.fillRect(mmPx(x), mmPx(y), mmPx(w), mmPx(h));
  };

  // Inner frame (thin decorative border inside the content area).
  stroke(green, 0.12); rectMM(12, 12, PAGE_W - 24, PAGE_H - 24);

  // Side ribbons — thin green strips + short blocks on the left/right edges.
  fillRectMM(12, 85, 1, 62, green);
  fillRectMM(PAGE_W - 13, 85, 1, 62, green);
  fillRectMM(12, 85, 40, 22, green);
  fillRectMM(PAGE_W - 52, 85, 40, 22, green);

  // Bottom green bar — full width at the very bottom.
  fillRectMM(0, PAGE_H - 13.3, PAGE_W, 13.3, green);

  // Bottom-left decorative squares.
  fillRectMM(21.75, 169.2, 14.06, 14.06, [59, 157, 40]);
  fillRectMM(31.82, 159.9, 11.4, 11.4, green);
  fillRectMM(37.66, 178.0, 12.47, 12.47, purple);

  // Diagonal-stripe circle (certificate.html .stripe-circle, 75px round).
  // Chords of each 45° stripe line inside the circle — same math as the PDF path.
  {
    ctx.strokeStyle = 'rgb(166,211,162)';
    ctx.lineWidth = mmPx(1.06);
    const ssR = 9.95;
    const ssSum = 223.4 + 175.15;
    for (let s = 384.5; s <= 412.7; s += 3.38) {
      const d = s - ssSum;
      if (Math.abs(d) >= ssR * Math.SQRT2) continue;
      const h = Math.sqrt(ssR * ssR - (d * d) / 2);
      const fx = mmPx(223.4 + d / 2);
      const fy = mmPx(175.15 + d / 2);
      const hx = mmPx(h / Math.SQRT2);
      const hy = mmPx(h / Math.SQRT2);
      ctx.beginPath();
      ctx.moveTo(fx + hx, fy - hy);
      ctx.lineTo(fx - hx, fy + hy);
      ctx.stroke();
    }
  }

  // Bottom-right concentric arcs: outer green ring, inner purple ring, each
  // with a white interior fill (reference .stripe/arc circles).
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(mmPx(281.0), mmPx(203.2), mmPx(47.08), 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = rgb(green); ctx.lineWidth = mmPx(15.38);
  ctx.beginPath(); ctx.arc(mmPx(281.0), mmPx(203.2), mmPx(39.39), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(mmPx(289.9), mmPx(212.9), mmPx(28.64), 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = rgb(purple); ctx.lineWidth = mmPx(7.96);
  ctx.beginPath(); ctx.arc(mmPx(289.9), mmPx(212.9), mmPx(24.66), 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = mmPx(0.12);

  // ---- Top decoration (mirrors PDF drawTopDecoration) ----
  // Large purple rounded rectangle at top-left.
  ctx.fillStyle = rgb(purple);
  ctx.beginPath(); ctx.roundRect(mmPx(16), 0, mmPx(27), mmPx(40), [0, 0, mmPx(13), mmPx(13)]); ctx.fill();
  // Small purple square at top-right area.
  ctx.fillStyle = rgb(purple);
  ctx.fillRect(mmPx(PAGE_W - 33), 0, mmPx(18), mmPx(18));
  // Green square below the purple one.
  ctx.fillStyle = rgb(green);
  ctx.fillRect(mmPx(PAGE_W - 46), mmPx(14), mmPx(13), mmPx(13));
  // Smaller green square further down.
  ctx.fillStyle = rgb(green);
  ctx.fillRect(mmPx(PAGE_W - 36), mmPx(28), mmPx(9), mmPx(9));

  // ---- Award seals (university logo left, club logo right) ----
  {
    const r = mmPx(SEAL_D / 2);
    const cy = mmPx(SEAL_CY);
    const sealPx = async (cxmm: number, url?: string, sub?: string) => {
      const cx = mmPx(cxmm);
      // Outer green ring.
      ctx.fillStyle = rgb(green); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      // White ring divider.
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, cy, r - mmPx(3), 0, Math.PI * 2); ctx.fill();
      // Ink inner ring.
      stroke(greenDeep, 0.5); ctx.beginPath(); ctx.arc(cx, cy, r - mmPx(5.2), 0, Math.PI * 2); ctx.stroke();
      // Inner photo area.
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, cy, r - mmPx(5.2), 0, Math.PI * 2); ctx.fill();
      // Logo fitted inside the circle (aspect preserved, corner-safe).
      if (url) {
        const img = await canvasLoadImage(url);
        if (img) {
          const ratio = img.naturalWidth / img.naturalHeight || 1;
          const { w, h } = fitLogoInCircle(ratio, r - mmPx(5.2), mmPx(SEAL_LOGO_PAD));
          ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
        }
      }
      // Small caption under the ring.
      if (sub) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        let s = 4.2 * PT_MM * EXPORT_PX_PER_MM;
        ctx.font = font('Times New Roman', 'bold', s);
        while (s > 2.6 * PT_MM * EXPORT_PX_PER_MM && ctx.measureText(sub).width > mmPx(r * 1.8)) {
          s -= 0.2 * PT_MM * EXPORT_PX_PER_MM; ctx.font = font('Times New Roman', 'bold', s);
        }
        ctx.fillStyle = rgb(t.colors.muted);
        ctx.fillText(sub, cx, cy + r + mmPx(3.6));
      }
    };
    await sealPx(SEAL_CX_L, data.iiucLogoUrl, 'UNIVERSITY');
    await sealPx(SEAL_CX_R, data.clubLogoUrl);
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

  // recipient name — script font with serif fallback; rendered once by the shared
  // renderer so the PNG export and the PDF draw the exact same glyphs at the same
  // physical size and baseline.
  const name = data.memberName.trim();
  const nameSizePt = d.fonts.nameSize || 20;
  const nameLarge = name.toUpperCase();
  const nameTopMm = introBottomMm + 2.8;
  const nameBottomMm = nameTopMm + 10.5;
  const nameBaseMm = nameBottomMm - 1.2;
  const nm = await renderNameImage(name, d, t.colors.primary);
  if (nm && nm.dataUrl) {
    const img = await canvasLoadImage(nm.dataUrl);
    if (img) {
      ctx.drawImage(
        img,
        C.cx - (nm.widthMm * EXPORT_PX_PER_MM) / 2,
        mmPx(nameBaseMm - nm.baselineFromTopMm),
        nm.widthMm * EXPORT_PX_PER_MM,
        nm.heightMm * EXPORT_PX_PER_MM,
      );
    }
  }

  // underline
  const underlineYmm = nameBottomMm + 1.6;
  ctx.font = font('Times New Roman', 'bold', nameSizePt * PT_MM * EXPORT_PX_PER_MM);
  const nameW = Math.min(ctx.measureText(nameLarge).width + mmPx(18), mmPx(SEAL_BODY_W - 12) + mmPx(12));
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

  const maxWmm = SEAL_BODY_W;
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
      for (const m of metas) below += wrapTexLimit(m, SIG_META_PT + 0.5, slotWmm - 2, 99).length * (SIG_META_PITCH + 0.3);
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
  const bodyStartSize = (d.fonts.bodySize || 9.5) + 1.2;
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
  const qrSizePx = mmPx(QR_SIZE_MM);
  const qrXPx = C.cx - qrSizePx / 2;
  const qrYPx = bandTopPx;

  // ---- Signatures ----
  if (sigs.length > 0) {
    const sigCount = Math.min(sigs.length, 3);
    const slotWmm = sigCount === 1 ? 80 : 54;
    let slots: number[];
    if (sigCount === 1) slots = [CX];
    else if (sigCount === 2) slots = [CX - 58, CX + 58];
    else {
      const gap = ((CONTENT_R - 4) - (CONTENT_L + 4) - slotWmm * sigCount) / (sigCount - 1);
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
      for (const m of metas) below += wrapTexLimit(m, SIG_META_PT + 0.5, slotWmm - 2, 99).length * (SIG_META_PITCH + 0.3);
      if (below > maxBelowMM) maxBelowMM = below;
    }
    // Anchor the signature line close to the closing text, but never let the
    // block drop into the QR/footer-band reserved region.
    const footSafeLinePx = bandTopPx - mmPx(2) - mmPx(maxBelowMM);
    const lineY = Math.min(footSafeLinePx, Math.max(mmPx(closBaseMm + 6), mmPx(closBaseMm + 17)));
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
          const { generateSignatureDataURL, signatureTextFor } = await import('./signature-gen');
          try { url = await generateSignatureDataURL(signatureTextFor(sig), 220, 60); } catch {}
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
      for (let mi = 0; mi < metaLines.length; mi++) {
        ctx.font = font('Times New Roman', mi === 0 ? 'bold' : 'normal', SIG_META_PT * PT_MM * EXPORT_PX_PER_MM);
        ctx.fillStyle = rgb(mi === 0 ? t.colors.text : t.colors.muted);
        for (const wl of wrapTexLimit(metaLines[mi].toUpperCase(), SIG_META_PT, slotWmm - 2, 99)) {
          ctx.fillText(wl, x, py); py += mmPx(SIG_META_PITCH);
        }
      }
    }
  }

  // ---- QR ----
  if (qrOn) {
    const { default: QRCode } = await import('qrcode');
    try {
      const qrUrl = `${data.siteUrl || 'https://iiuc-arms.eu.cc'}/clubs/preview/${data.certificateId}`;
      const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 640, margin: 4, errorCorrectionLevel: 'H', color: { dark: '#1a1a2e', light: '#ffffff' } });
      const qrSize = QR_SIZE_MM * EXPORT_PX_PER_MM;
      const qrX = C.cx - qrSize / 2, qrY = bandTopPx;
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

  const headerBottom = drawHeader(pdf, t, data);

  const titleEnd = drawTitle(pdf, t, headerBottom);

  const bodyBottom = await drawBody(pdf, t, data, titleEnd + 3, closingMax);

  // Closing line always drawn, and always above the signature / footer area.
  const closBase = Math.min(bodyBottom + 2, closingMax);
  drawClosing(pdf, t, closBase);

  // Award seals — university logo on the left, club logo on the right.
  await drawSeal(pdf, t, logos);

  if (signatories.length > 0) {
    await drawSignatures(pdf, t, signatories, closBase, bandTop);
  }

  await drawFooter(pdf, t, data, data.siteUrl || 'https://iiuc-arms.eu.cc');
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
