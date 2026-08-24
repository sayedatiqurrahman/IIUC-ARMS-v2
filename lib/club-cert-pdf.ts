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
  issuedBy: string;
  issuedAt: string;
  siteUrl?: string;
  signatories?: CertSignatory[];
  theme?: CertTheme;
}

const PAGE_W = 297;
const PAGE_H = 210;

function drawBorder(pdf: any, t: CertTheme) {
  const m = 5;
  const m2 = 8;

  pdf.setDrawColor(...t.colors.border);
  pdf.setLineWidth(t.border.width);
  pdf.rect(m, m, PAGE_W - m * 2, PAGE_H - m * 2);

  if (t.border.style === 'double') {
    pdf.setLineWidth(t.border.accentWidth);
    pdf.rect(m2, m2, PAGE_W - m2 * 2, PAGE_H - m2 * 2);
    pdf.setDrawColor(...t.colors.borderAccent);
    pdf.setLineWidth(0.15);
    pdf.rect(m2 + 1.5, m2 + 1.5, PAGE_W - (m2 + 1.5) * 2, PAGE_H - (m2 + 1.5) * 2);
  } else if (t.border.style === 'single') {
    pdf.setLineWidth(t.border.accentWidth || 0.3);
    pdf.rect(m2, m2, PAGE_W - m2 * 2, PAGE_H - m2 * 2);
  } else if (t.border.style === 'ornamental') {
    pdf.setLineWidth(t.border.accentWidth);
    pdf.rect(m2, m2, PAGE_W - m2 * 2, PAGE_H - m2 * 2);
    pdf.setDrawColor(...t.colors.borderAccent);
    pdf.setLineWidth(0.15);
    const step = 8;
    for (let x = m2 + step; x < PAGE_W - m2; x += step) {
      pdf.circle(x, m2, 0.6, 'S');
      pdf.circle(x, PAGE_H - m2, 0.6, 'S');
    }
    for (let y = m2 + step; y < PAGE_H - m2; y += step) {
      pdf.circle(m2, y, 0.6, 'S');
      pdf.circle(PAGE_W - m2, y, 0.6, 'S');
    }
  } else if (t.border.style === 'rope') {
    pdf.setLineWidth(t.border.accentWidth);
    pdf.rect(m2, m2, PAGE_W - m2 * 2, PAGE_H - m2 * 2);
    pdf.setDrawColor(...t.colors.borderAccent);
    pdf.setLineWidth(0.2);
    for (let i = 0; i < 2; i++) {
      const offset = m2 + 2 + i * 2;
      pdf.rect(offset, offset, PAGE_W - offset * 2, PAGE_H - offset * 2);
    }
  }

  if (t.border.cornerOrnaments) {
    pdf.setFillColor(...t.colors.borderAccent);
    const c = [
      [m + 2, m + 2], [PAGE_W - m - 2, m + 2],
      [m + 2, PAGE_H - m - 2], [PAGE_W - m - 2, PAGE_H - m - 2],
    ];
    for (const [x, y] of c) {
      pdf.circle(x, y, 1.2, 'F');
    }
    const c2 = [
      [m2 + 2, m2 + 2], [PAGE_W - m2 - 2, m2 + 2],
      [m2 + 2, PAGE_H - m2 - 2], [PAGE_W - m2 - 2, PAGE_H - m2 - 2],
    ];
    pdf.setFillColor(...t.colors.primary);
    for (const [x, y] of c2) {
      pdf.circle(x, y, 0.7, 'F');
    }
  }
}

function drawHeader(pdf: any, t: CertTheme, departmentName: string, clubName: string) {
  const cx = PAGE_W / 2;

  if (t.header.style === 'banner' || t.header.style === 'regal') {
    pdf.setFillColor(...t.colors.headerBg);
    pdf.rect(14, 14, PAGE_W - 28, t.header.style === 'regal' ? 24 : 26, 'F');

    pdf.setDrawColor(...t.colors.borderAccent);
    pdf.setLineWidth(0.3);
    pdf.rect(14.5, 14.5, PAGE_W - 29, t.header.style === 'regal' ? 23 : 25);

    if (t.header.style === 'regal') {
      pdf.setFillColor(...t.colors.borderAccent);
      pdf.circle(cx, 20, 0.8, 'F');
      pdf.circle(cx - 6, 20, 0.5, 'F');
      pdf.circle(cx + 6, 20, 0.5, 'F');
    }

    const uniY = t.header.style === 'regal' ? 27 : 24;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(...t.colors.headerText);
    pdf.text('INTERNATIONAL ISLAMIC UNIVERSITY CHITTAGONG', cx, uniY, { align: 'center' });

    if (t.header.showAbbreviation) {
      pdf.setFontSize(8);
      pdf.setTextColor(...t.colors.headerText);
      pdf.text('IIUC', cx, uniY + 6, { align: 'center' });
    }
    if (t.header.showLocation) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      const muted: [number, number, number] = [
        Math.min(255, t.colors.headerText[0] + 30),
        Math.min(255, t.colors.headerText[1] + 30),
        Math.min(255, t.colors.headerText[2] + 30),
      ];
      pdf.setTextColor(...muted);
      pdf.text('Chittagong, Bangladesh', cx, uniY + 11, { align: 'center' });
    }
  } else {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(...t.colors.primary);
    pdf.text('INTERNATIONAL ISLAMIC UNIVERSITY CHITTAGONG', cx, 22, { align: 'center' });
    if (t.header.showAbbreviation) {
      pdf.setFontSize(8);
      pdf.setTextColor(...t.colors.muted);
      pdf.text('IIUC', cx, 28, { align: 'center' });
    }
  }

  const deptY = t.header.style === 'banner' || t.header.style === 'regal' ? 48 : 38;

  if (departmentName) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...t.colors.muted);
    pdf.text(`Department of ${departmentName}`, cx, deptY, { align: 'center' });
  }

  if (clubName) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(...t.colors.primary);
    pdf.text(clubName, cx, deptY + 7, { align: 'center' });
  }
}

function drawTitle(pdf: any, t: CertTheme) {
  const cx = PAGE_W / 2;
  const y = 65;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(t.title.fontSize);
  pdf.setTextColor(...t.colors.primary);
  pdf.text('CERTIFICATE', cx, y, { align: 'center' });

  pdf.setFontSize(t.title.subtitleFontSize);
  pdf.setTextColor(...t.colors.secondary);
  pdf.text(t.title.subtitle, cx, y + 8, { align: 'center' });

  const decoY = y + 12;
  if (t.title.decoration === 'line') {
    pdf.setDrawColor(...t.colors.secondary);
    pdf.setLineWidth(0.5);
    pdf.line(cx - 50, decoY, cx + 50, decoY);
    pdf.setFillColor(...t.colors.secondary);
    pdf.circle(cx, decoY, 1.5, 'F');
  } else if (t.title.decoration === 'diamond') {
    pdf.setDrawColor(...t.colors.secondary);
    pdf.setLineWidth(0.4);
    pdf.line(cx - 55, decoY, cx - 5, decoY);
    pdf.line(cx + 5, decoY, cx + 55, decoY);
    pdf.setFillColor(...t.colors.secondary);
    const sz = 2.5;
    pdf.moveTo(cx, decoY - sz);
    pdf.lineTo(cx + sz, decoY);
    pdf.lineTo(cx, decoY + sz);
    pdf.lineTo(cx - sz, decoY);
    pdf.closePath();
    pdf.fill();
  } else if (t.title.decoration === 'dots') {
    pdf.setFillColor(...t.colors.secondary);
    for (let i = -4; i <= 4; i++) {
      const r = i === 0 ? 1.5 : i % 2 === 0 ? 0.8 : 0.5;
      pdf.circle(cx + i * 6, decoY, r, 'F');
    }
  } else if (t.title.decoration === 'flourish') {
    pdf.setDrawColor(...t.colors.secondary);
    pdf.setLineWidth(0.4);
    pdf.line(cx - 60, decoY, cx - 10, decoY);
    pdf.line(cx + 10, decoY, cx + 60, decoY);
    pdf.setFillColor(...t.colors.secondary);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('\u2756', cx, decoY + 1.5, { align: 'center' });
  }
}

function drawBody(pdf: any, t: CertTheme, data: CertPDFData) {
  const cx = PAGE_W / 2;
  let y = 84;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(...t.colors.muted);
  pdf.text('We hereby express our sincere appreciation to', cx, y, { align: 'center' });

  y += 10;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(...t.colors.primary);
  pdf.text(data.memberName.toUpperCase(), cx, y, { align: 'center' });

  const nameW = pdf.getTextWidth(data.memberName.toUpperCase());
  pdf.setDrawColor(...t.colors.secondary);
  pdf.setLineWidth(0.4);
  pdf.line(cx - nameW / 2 - 8, y + 3, cx + nameW / 2 + 8, y + 3);

  y += 12;
  const recognition = getRoleRecognition(data.post || '');

  let bodyText: string;
  if (data.post && data.clubName) {
    bodyText = `in recognition of your outstanding contributions and dedicated efforts as ${data.post} of ${data.clubName} in strengthening and supporting the activities of our club and department. We sincerely value your commitment, leadership, and contributions throughout ${data.servicePeriod || data.session || 'your tenure'}.`;
  } else if (data.clubName) {
    bodyText = `in recognition of your outstanding contributions and active participation as a member of ${data.clubName}. We sincerely value your commitment and dedication throughout ${data.servicePeriod || data.session || 'your tenure'}.`;
  } else {
    bodyText = 'in recognition of your outstanding contributions and dedicated efforts.';
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.setTextColor(...t.colors.text);

  const lines = pdf.splitTextToSize(bodyText, PAGE_W - 70);
  for (const line of lines) {
    pdf.text(line, cx, y, { align: 'center' });
    y += 5;
  }

  y += 2;
  if (recognition) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(9);
    pdf.setTextColor(...t.colors.muted);
    const recLines = pdf.splitTextToSize(`We value your ${recognition}.`, PAGE_W - 80);
    for (const line of recLines) {
      pdf.text(line, cx, y, { align: 'center' });
      y += 4.5;
    }
  }

  y += 2;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(...t.colors.muted);
  pdf.text('Thank you for your hard work, dedication, and invaluable contributions.', cx, y, { align: 'center' });

  return y + 5;
}

function drawSignatures(pdf: any, t: CertTheme, signatories: CertSignatory[]) {
  if (!signatories || signatories.length === 0) return;

  const y = PAGE_H - 46;
  const sigCount = Math.min(signatories.length, 3);

  const leftX = 38;
  const centerX = PAGE_W / 2;
  const rightX = PAGE_W - 38;

  const positions = sigCount === 1
    ? [centerX]
    : sigCount === 2
      ? [centerX - 65, centerX + 65]
      : [leftX, centerX, rightX];

  for (let i = 0; i < sigCount; i++) {
    const sig = signatories[i];
    const x = positions[i];

    if (t.signatures.style === 'line') {
      pdf.setDrawColor(...t.colors.primary);
      pdf.setLineWidth(0.3);
      pdf.line(x - 28, y, x + 28, y);
    } else if (t.signatures.style === 'boxed') {
      pdf.setDrawColor(...t.colors.primary);
      pdf.setLineWidth(0.2);
      pdf.rect(x - 30, y - 2, 60, 22);
    } else {
      pdf.setDrawColor(...t.colors.primary);
      pdf.setLineWidth(0.5);
      pdf.line(x - 25, y, x + 25, y);
    }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...t.colors.text);
    pdf.text(sig.name || '', x, y + 5, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...t.colors.muted);
    pdf.text(sig.title || '', x, y + 10, { align: 'center' });

    if (sig.designation) {
      pdf.setFontSize(6.5);
      pdf.text(sig.designation, x, y + 14, { align: 'center' });
    }
  }
}

async function drawBrandedQR(pdf: any, t: CertTheme, certificateId: string, siteUrl: string) {
  const cx = PAGE_W / 2;
  const qrY = PAGE_H - 22;
  const qrSize = t.footer.qrSize;

  const qrUrl = `${siteUrl}/clubs/verify/${certificateId}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    width: 200,
    margin: 1,
    errorCorrectionLevel: 'H',
  });

  const qrX = cx - qrSize / 2;
  const qrTop = qrY - qrSize / 2;

  pdf.addImage(qrDataUrl, 'PNG', qrX, qrTop, qrSize, qrSize);

  const centerX = cx;
  const centerY = qrTop + qrSize / 2;
  const boxSize = qrSize * 0.32;

  pdf.setFillColor(255, 255, 255);
  pdf.rect(centerX - boxSize, centerY - boxSize, boxSize * 2, boxSize * 2, 'F');

  pdf.setDrawColor(...t.colors.primary);
  pdf.setLineWidth(0.3);
  pdf.rect(centerX - boxSize, centerY - boxSize, boxSize * 2, boxSize * 2, 'S');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(5.5);
  pdf.setTextColor(...t.colors.primary);
  pdf.text('IIUC', centerX, centerY - 1, { align: 'center' });
  pdf.setFontSize(3.5);
  pdf.setTextColor(...t.colors.muted);
  pdf.text('ARMS', centerX, centerY + 3, { align: 'center' });

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6);
  pdf.setTextColor(...t.colors.primary);
  pdf.text(t.footer.verifiedText, cx, qrY + qrSize / 2 + 5, { align: 'center' });

  if (t.footer.showScanHint) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5);
    pdf.setTextColor(...t.colors.muted);
    pdf.text('Scan to verify authenticity', cx, qrY + qrSize / 2 + 9, { align: 'center' });
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(5);
  pdf.setTextColor(...t.colors.muted);
  pdf.text(`Certificate ID: ${certificateId}`, cx, qrY + qrSize / 2 + (t.footer.showScanHint ? 13 : 10), { align: 'center' });
}

function drawDate(pdf: any, t: CertTheme, issuedAt: string) {
  const d = new Date(issuedAt);
  const dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...t.colors.muted);
  pdf.text(`Date of Issue: ${dateStr}`, PAGE_W - 20, PAGE_H - 12, { align: 'right' });
}

function drawStampArea(pdf: any, t: CertTheme) {
  pdf.setFillColor(...t.colors.background);
  pdf.rect(20, PAGE_H - 38, 30, 24, 'F');
  pdf.setDrawColor(...t.colors.muted);
  pdf.setLineWidth(0.2);
  pdf.setLineDashPattern([1, 1], 0);
  pdf.rect(20, PAGE_H - 38, 30, 24, 'S');
  pdf.setLineDashPattern([], 0);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(4.5);
  pdf.setTextColor(...t.colors.muted);
  pdf.text('Official Seal', 35, PAGE_H - 24, { align: 'center' });
}

async function renderCertificate(pdf: any, data: CertPDFData, isFirstPage: boolean) {
  if (!isFirstPage) pdf.addPage();

  const t = data.theme || DEFAULT_THEME;

  pdf.setFillColor(...t.colors.background);
  pdf.rect(0, 0, PAGE_W, PAGE_H, 'F');

  drawBorder(pdf, t);
  drawHeader(pdf, t, data.department, data.clubName);
  drawTitle(pdf, t);
  drawBody(pdf, t, data);
  drawSignatures(pdf, t, data.signatories || []);
  drawStampArea(pdf, t);

  const siteUrl = data.siteUrl || 'https://iiuc-arms.eu.cc';
  await drawBrandedQR(pdf, t, data.certificateId, siteUrl);
  drawDate(pdf, t, data.issuedAt);
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
