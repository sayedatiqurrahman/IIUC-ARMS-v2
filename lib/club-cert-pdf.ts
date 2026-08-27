import QRCode from 'qrcode';
import { CertTheme, DEFAULT_THEME, getRoleRecognition, CertSignatory } from './cert-theme';

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

const W = 297;
const H = 210;

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

function drawBorder(p: any, t: CertTheme) {
  const m1 = 6, m2 = 9;

  p.setDrawColor(...t.colors.primary);
  p.setLineWidth(1.5);
  p.rect(m1, m1, W - m1 * 2, H - m1 * 2);

  p.setDrawColor(...t.colors.secondary);
  p.setLineWidth(0.4);
  p.rect(m2, m2, W - m2 * 2, H - m2 * 2);

  if (t.border.cornerOrnaments) {
    const orn = [[m1 + 3, m1 + 3], [W - m1 - 3, m1 + 3], [m1 + 3, H - m1 - 3], [W - m1 - 3, H - m1 - 3]];
    for (const [x, y] of orn) {
      p.setFillColor(...t.colors.secondary);
      p.circle(x, y, 1.5, 'F');
      p.setFillColor(...t.colors.primary);
      p.circle(x, y, 0.7, 'F');
    }
  }
}

function drawHeader(p: any, t: CertTheme, department: string, clubName: string, logos: { iiuc?: string; club?: string }) {
  const cx = W / 2;

  if (logos.iiuc) {
    try { p.addImage(logos.iiuc, 'PNG', cx - 70, 16, 16, 16); } catch {}
  }
  if (logos.club) {
    try { p.addImage(logos.club, 'PNG', cx + 54, 16, 16, 16); } catch {}
  }

  p.setFont('helvetica', 'bold');
  p.setFontSize(12);
  p.setTextColor(...t.colors.primary);
  p.text('INTERNATIONAL ISLAMIC UNIVERSITY CHITTAGONG', cx, 25, { align: 'center' });

  p.setFont('helvetica', 'normal');
  p.setFontSize(7);
  p.setTextColor(...t.colors.muted);
  p.text('Chittagong, Bangladesh', cx, 31, { align: 'center' });

  if (department) {
    p.setFont('helvetica', 'normal');
    p.setFontSize(8);
    p.setTextColor(...t.colors.muted);
    p.text(`Department of ${department}`, cx, 38, { align: 'center' });
  }

  if (clubName) {
    p.setFont('helvetica', 'bold');
    p.setFontSize(10);
    p.setTextColor(...t.colors.secondary);
    p.text(clubName, cx, department ? 44 : 40, { align: 'center' });
  }
}

function drawTitle(p: any, t: CertTheme) {
  const cx = W / 2;
  const y = 58;

  p.setFont('helvetica', 'bold');
  p.setFontSize(28);
  p.setTextColor(...t.colors.primary);
  p.text('CERTIFICATE', cx, y, { align: 'center' });

  p.setFontSize(11);
  p.setTextColor(...t.colors.secondary);
  p.text('OF APPRECIATION', cx, y + 9, { align: 'center' });

  const dy = y + 14;
  p.setDrawColor(...t.colors.secondary);
  p.setLineWidth(0.5);
  p.line(cx - 55, dy, cx - 8, dy);
  p.line(cx + 8, dy, cx + 55, dy);
  p.setFillColor(...t.colors.secondary);
  const sz = 2.5;
  p.moveTo(cx, dy - sz);
  p.lineTo(cx + sz, dy);
  p.lineTo(cx, dy + sz);
  p.lineTo(cx - sz, dy);
  p.closePath();
  p.fill();
}

function drawBody(p: any, t: CertTheme, data: CertPDFData) {
  const cx = W / 2;
  let y = 82;

  p.setFont('helvetica', 'normal');
  p.setFontSize(9);
  p.setTextColor(...t.colors.muted);
  p.text('This certificate is proudly presented to', cx, y, { align: 'center' });

  y += 9;
  p.setFont('times', 'bold');
  p.setFontSize(20);
  p.setTextColor(...t.colors.primary);
  p.text(data.memberName.toUpperCase(), cx, y, { align: 'center' });

  const nameW = p.getTextWidth(data.memberName.toUpperCase());
  p.setDrawColor(...t.colors.secondary);
  p.setLineWidth(0.3);
  p.line(cx - nameW / 2 - 10, y + 2.5, cx + nameW / 2 + 10, y + 2.5);

  y += 10;
  const recognition = getRoleRecognition(data.post || '');

  let bodyText: string;
  if (data.post && data.clubName) {
    bodyText = `In recognition of your outstanding contributions and dedicated efforts as ${data.post} of ${data.clubName} in strengthening and supporting the activities of our club and department. We sincerely value your commitment, leadership, and contributions throughout ${data.servicePeriod || data.session || 'your tenure'}.`;
  } else if (data.clubName) {
    bodyText = `In recognition of your outstanding contributions and active participation as a member of ${data.clubName}. We sincerely value your commitment and dedication throughout ${data.servicePeriod || data.session || 'your tenure'}.`;
  } else {
    bodyText = 'In recognition of your outstanding contributions and dedicated efforts.';
  }

  p.setFont('helvetica', 'normal');
  p.setFontSize(9);
  p.setTextColor(...t.colors.text);

  const lines = p.splitTextToSize(bodyText, W - 80);
  for (const line of lines) {
    p.text(line, cx, y, { align: 'center' });
    y += 4.5;
  }

  if (recognition) {
    y += 1;
    p.setFont('helvetica', 'italic');
    p.setFontSize(8.5);
    p.setTextColor(...t.colors.muted);
    const recLines = p.splitTextToSize(`We value your ${recognition}.`, W - 90);
    for (const line of recLines) {
      p.text(line, cx, y, { align: 'center' });
      y += 4;
    }
  }

  return y + 2;
}

async function drawSignatures(p: any, t: CertTheme, signatories: CertSignatory[]) {
  if (!signatories || signatories.length === 0) return;

  const y = H - 44;
  const sigCount = Math.min(signatories.length, 3);

  const leftX = 42;
  const centerX = W / 2;
  const rightX = W - 42;

  const positions = sigCount === 1
    ? [centerX]
    : sigCount === 2
      ? [centerX - 65, centerX + 65]
      : [leftX, centerX, rightX];

  for (let i = 0; i < sigCount; i++) {
    const sig = signatories[i];
    const x = positions[i];
    const hasSignature = sig.signatureUrl || sig.autoSignature !== false;

    p.setDrawColor(...t.colors.muted);
    p.setLineWidth(0.2);
    p.line(x - 28, y, x + 28, y);

    if (hasSignature) {
      let sigDataUrl = sig.signatureUrl;
      if (!sigDataUrl && sig.autoSignature !== false && sig.name) {
        const { generateSignatureDataURL } = await import('./signature-gen');
        sigDataUrl = await generateSignatureDataURL(sig.name, 200, 50);
      }
      if (sigDataUrl) {
        try {
          p.addImage(sigDataUrl, 'PNG', x - 15, y - 12, 30, 10);
        } catch {}
      }
    }

    const textY = hasSignature ? y + 2 : y + 5;

    p.setFont('helvetica', 'bold');
    p.setFontSize(8);
    p.setTextColor(...t.colors.text);
    p.text(sig.name || '', x, textY, { align: 'center' });

    p.setFont('helvetica', 'normal');
    p.setFontSize(7);
    p.setTextColor(...t.colors.muted);
    p.text(sig.title || '', x, textY + 4.5, { align: 'center' });

    if (sig.designation) {
      p.setFontSize(6);
      p.text(sig.designation, x, textY + 8.5, { align: 'center' });
    }
  }
}

async function drawQR(p: any, certificateId: string, siteUrl: string) {
  const qrUrl = `${siteUrl}/clubs/verify/${certificateId}`;
  let qrDataUrl: string;
  try {
    qrDataUrl = await QRCode.toDataURL(qrUrl, {
      width: 180,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });
  } catch {
    return;
  }

  const qrSize = 18;
  const qrX = W - 32 - qrSize / 2;
  const qrY = H - 30;

  try {
    p.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
  } catch {}

  p.setFont('helvetica', 'normal');
  p.setFontSize(5);
  p.setTextColor(100, 100, 100);
  p.text(certificateId, qrX + qrSize / 2, qrY + qrSize + 4, { align: 'center' });
}

function drawFooter(p: any, t: CertTheme, issuedAt: string) {
  const d = new Date(issuedAt);
  const dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  p.setFont('helvetica', 'normal');
  p.setFontSize(7);
  p.setTextColor(...t.colors.muted);
  p.text(`Date of Issue: ${dateStr}`, 20, H - 14);

  p.setDrawColor(...t.colors.muted);
  p.setLineWidth(0.2);
  p.rect(W - 62, H - 38, 34, 24);
  p.setFontSize(4.5);
  p.text('Official Seal', W - 45, H - 24, { align: 'center' });
}

async function renderCertificate(pdf: any, data: CertPDFData, isFirstPage: boolean) {
  if (!isFirstPage) pdf.addPage();

  const t = data.theme || DEFAULT_THEME;

  pdf.setFillColor(...t.colors.background);
  pdf.rect(0, 0, W, H, 'F');

  const logoUrls: { iiuc?: string; club?: string } = {};
  const fetches: Promise<void>[] = [];
  if (data.iiucLogoUrl) fetches.push(loadImage(data.iiucLogoUrl).then(u => { if (u) logoUrls.iiuc = u; }));
  if (data.clubLogoUrl) fetches.push(loadImage(data.clubLogoUrl).then(u => { if (u) logoUrls.club = u; }));
  if (fetches.length > 0) await Promise.all(fetches);

  drawBorder(pdf, t);
  drawHeader(pdf, t, data.department, data.clubName, logoUrls);
  drawTitle(pdf, t);
  drawBody(pdf, t, data);
  await drawSignatures(pdf, t, data.signatories || []);
  drawFooter(pdf, t, data.issuedAt);

  const siteUrl = data.siteUrl || 'https://iiuc-arms.eu.cc';
  await drawQR(pdf, data.certificateId, siteUrl);
}

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
