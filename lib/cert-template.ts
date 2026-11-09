// Shared HTML/CSS certificate template engine.
// Templates use {{placeholder}} tokens which are replaced at render time.

export interface CertTemplateAttribute {
  key: string;
  label: string;
  group: 'certificate' | 'recipient' | 'organization' | 'contributor' | 'system';
  sample: string;
}

export const CERT_TEMPLATE_ATTRIBUTES: CertTemplateAttribute[] = [
  { key: 'certificateId', label: 'Certificate ID', group: 'certificate', sample: 'IIUC-XKMR-B572-ETGQ' },
  { key: 'memberName', label: 'Recipient name', group: 'recipient', sample: 'Sayed Atiqur Rahman' },
  { key: 'universityId', label: 'University ID', group: 'recipient', sample: 'C243155' },
  { key: 'department', label: 'Department', group: 'recipient', sample: 'Computer Science & Engineering' },
  { key: 'session', label: 'Session', group: 'recipient', sample: '2022-2023' },
  { key: 'post', label: 'Post / role', group: 'recipient', sample: 'General Secretary' },
  { key: 'eventName', label: 'Event name', group: 'certificate', sample: 'Annual Programming Contest' },
  { key: 'servicePeriod', label: 'Service period', group: 'certificate', sample: 'Jan 2025 – Dec 2025' },
  { key: 'organization', label: 'Organization / club', group: 'organization', sample: 'IIUC Computer Club' },
  { key: 'organizationLogo', label: 'Organization logo URL', group: 'organization', sample: '/iiuc-logo.png' },
  { key: 'issuedBy', label: 'Issued by', group: 'organization', sample: 'IIUC-ARMS' },
  { key: 'issuedAt', label: 'Issue date', group: 'certificate', sample: '2026-11-08' },
  { key: 'issuedAtLong', label: 'Issue date (long)', group: 'certificate', sample: 'November 8, 2026' },
  { key: 'signatoriesHtml', label: 'Signatories block (HTML)', group: 'system', sample: '<div class="sig">...</div>' },
  { key: 'qrCode', label: 'Verification QR code (HTML)', group: 'system', sample: '<img src="data:image/png;base64,...">' },
  { key: 'verifyUrl', label: 'Verification URL', group: 'system', sample: 'https://arms.iiuc.net/clubs/preview/IIUC-...' },
  { key: 'siteUrl', label: 'Site URL', group: 'system', sample: 'https://arms.iiuc.net' },
  { key: 'githubLogin', label: 'GitHub username', group: 'contributor', sample: 'sayedatiqurrahman' },
  { key: 'githubUrl', label: 'GitHub profile URL', group: 'contributor', sample: 'https://github.com/sayedatiqurrahman' },
  { key: 'avatarUrl', label: 'GitHub avatar URL', group: 'contributor', sample: 'https://avatars.githubusercontent.com/u/...' },
  { key: 'role', label: 'Contributor role', group: 'contributor', sample: 'Founder & Lead' },
  { key: 'codeCommits', label: 'Code commits', group: 'contributor', sample: '656' },
  { key: 'dataCommits', label: 'Data commits', group: 'contributor', sample: '231' },
  { key: 'totalCommits', label: 'Total commits', group: 'contributor', sample: '887' },
  { key: 'issueContributions', label: 'Issues opened', group: 'contributor', sample: '12' },
  { key: 'designContributions', label: 'Designs published', group: 'contributor', sample: '3' },
  { key: 'prCount', label: 'Pull requests', group: 'contributor', sample: '4' },
  { key: 'totalContributions', label: 'Total contributions', group: 'contributor', sample: '902' },
  { key: 'contributionSummary', label: 'Contribution summary', group: 'contributor', sample: '887 commits · 12 issues · 3 designs' },
  { key: 'contributionDetails', label: 'Contribution details (HTML)', group: 'contributor', sample: '<ul class="contrib-list">...</ul>' },
  { key: 'firstContribution', label: 'First contribution', group: 'contributor', sample: 'Jan 2024' },
  { key: 'lastContribution', label: 'Latest contribution', group: 'contributor', sample: 'Nov 2026' },
  { key: 'founderName', label: 'Founder name', group: 'organization', sample: 'Sayed Atiqur Rahman' },
  { key: 'founderTitle', label: 'Founder title', group: 'organization', sample: 'Founder, IIUC-ARMS' },
];

export const MAX_TEMPLATE_HTML = 200_000;
export const MAX_TEMPLATE_CSS = 100_000;

const DANGEROUS_TAGS = /<\s*(script|iframe|object|embed|link|meta|base|form|input|button|textarea|select)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const DANGEROUS_SELF_CLOSING = /<\s*(script|iframe|object|embed|link|meta|base)\b[^>]*\/?\s*>/gi;
const DANGEROUS_ATTRS = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_URL = /(?:href|src|action|formaction)\s*=\s*(?:"|')?\s*javascript:[^"'>\s]*/gi;

export function sanitizeTemplateHtml(input: string): string {
  return String(input || '')
    .replace(DANGEROUS_TAGS, '')
    .replace(DANGEROUS_SELF_CLOSING, '')
    .replace(DANGEROUS_ATTRS, '')
    .replace(JAVASCRIPT_URL, '');
}

export function sanitizeTemplateCss(input: string): string {
  return String(input || '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/behavior\s*:/gi, '')
    .replace(/-moz-binding\s*:/gi, '')
    .replace(/url\s*\(\s*(['"]?)\s*javascript:[^)]*\)/gi, 'url()');
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value?: string | null, long = false): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return long
    ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : d.toISOString().slice(0, 10);
}

function formatMonth(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function buildSignatoriesHtml(signatories: any[]): string {
  if (!Array.isArray(signatories) || signatories.length === 0) return '';
  return signatories
    .filter((s) => s && s.name)
    .map(
      (s) => `<div class="sig"><div class="sig-line"></div><div class="sig-name">${escapeHtml(s.name)}</div>` +
        (s.title ? `<div class="sig-title">${escapeHtml(s.title)}</div>` : '') +
        (s.designation ? `<div class="sig-designation">${escapeHtml(s.designation)}</div>` : '') +
        `</div>`,
    )
    .join('');
}

function buildContributionDetails(c: any): string {
  if (!c || !c.totals) return '';
  const items: string[] = [];
  if (c.totals.code) items.push(`<li><strong>${c.totals.code}</strong> commits to the source-code repository</li>`);
  if (c.totals.data) items.push(`<li><strong>${c.totals.data}</strong> commits to the academic-files repository</li>`);
  if (c.totals.issues) items.push(`<li><strong>${c.totals.issues}</strong> issues opened</li>`);
  if (c.totals.designs) items.push(`<li><strong>${c.totals.designs}</strong> Creative Hub designs published</li>`);
  if (c.totals.prs) items.push(`<li><strong>${c.totals.prs}</strong> pull requests</li>`);
  if (items.length === 0) return '';
  return `<ul class="contrib-list">${items.join('')}</ul>`;
}

function buildContributionSummary(c: any): string {
  if (!c || !c.totals) return '';
  const parts: string[] = [];
  const commits = (c.totals.code || 0) + (c.totals.data || 0);
  if (commits) parts.push(`${commits} commit${commits === 1 ? '' : 's'}`);
  if (c.totals.issues) parts.push(`${c.totals.issues} issue${c.totals.issues === 1 ? '' : 's'}`);
  if (c.totals.designs) parts.push(`${c.totals.designs} design${c.totals.designs === 1 ? '' : 's'}`);
  if (c.totals.prs) parts.push(`${c.totals.prs} pull request${c.totals.prs === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

export interface TemplateValuesOptions {
  siteUrl?: string;
  qrDataUrl?: string;
  founderName?: string;
}

export function buildTemplateValues(cert: any, opts: TemplateValuesOptions = {}): Record<string, string> {
  const c = cert?.contributionData || null;
  const siteUrl = opts.siteUrl || 'https://arms.iiuc.net';
  const verifyUrl = `${siteUrl}/clubs/preview/${cert?.certificateId || ''}`;
  const commits = c?.totals ? (c.totals.code || 0) + (c.totals.data || 0) : 0;

  return {
    certificateId: escapeHtml(cert?.certificateId || ''),
    memberName: escapeHtml(cert?.memberName || ''),
    universityId: escapeHtml(cert?.universityId || ''),
    department: escapeHtml(cert?.department || ''),
    session: escapeHtml(cert?.session || ''),
    post: escapeHtml(cert?.post || ''),
    eventName: escapeHtml(cert?.eventName || ''),
    servicePeriod: escapeHtml(cert?.servicePeriod || ''),
    organization: escapeHtml(cert?.organization || 'IIUC-ARMS'),
    organizationLogo: escapeHtml(cert?.organizationLogo || ''),
    issuedBy: escapeHtml(cert?.issuedBy || ''),
    issuedAt: escapeHtml(formatDate(cert?.issuedAt)),
    issuedAtLong: escapeHtml(formatDate(cert?.issuedAt, true)),
    signatoriesHtml: buildSignatoriesHtml(cert?.signatories || []),
    qrCode: opts.qrDataUrl
      ? `<img class="cert-qr" src="${escapeHtml(opts.qrDataUrl)}" alt="Verification QR code" />`
      : '',
    verifyUrl: escapeHtml(verifyUrl),
    siteUrl: escapeHtml(siteUrl),
    githubLogin: escapeHtml(cert?.githubLogin || c?.login || ''),
    githubUrl: escapeHtml(cert?.githubUrl || c?.githubUrl || ''),
    avatarUrl: escapeHtml(cert?.avatarUrl || c?.avatarUrl || ''),
    role: escapeHtml(cert?.post || c?.role || ''),
    codeCommits: escapeHtml(c?.totals?.code ?? ''),
    dataCommits: escapeHtml(c?.totals?.data ?? ''),
    totalCommits: escapeHtml(commits || ''),
    issueContributions: escapeHtml(c?.totals?.issues ?? ''),
    designContributions: escapeHtml(c?.totals?.designs ?? ''),
    prCount: escapeHtml(c?.totals?.prs ?? ''),
    totalContributions: escapeHtml(c?.totals?.total ?? ''),
    contributionSummary: escapeHtml(buildContributionSummary(c)),
    contributionDetails: buildContributionDetails(c),
    firstContribution: escapeHtml(formatMonth(c?.firstContribution)),
    lastContribution: escapeHtml(formatMonth(c?.lastContribution)),
    founderName: escapeHtml(opts.founderName || 'Sayed Atiqur Rahman'),
    founderTitle: escapeHtml('Founder, IIUC-ARMS'),
  };
}

export function renderTemplateDocument(html: string, css: string, values: Record<string, string>): string {
  const source = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${sanitizeTemplateCss(css || '')}</style>
</head>
<body>
${sanitizeTemplateHtml(html || '')}
</body>
</html>`;

  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : '';
  });
}

export const DEFAULT_TEMPLATE_HTML = `<div class="cert">
  <div class="cert-border">
    <div class="cert-top">
      <img class="cert-logo" src="{{organizationLogo}}" alt="" />
      <div class="cert-org">{{organization}}</div>
    </div>
    <div class="cert-title">CERTIFICATE</div>
    <div class="cert-subtitle">OF APPRECIATION</div>
    <div class="cert-intro">This is to certify that</div>
    <div class="cert-name">{{memberName}}</div>
    <div class="cert-rule"></div>
    <div class="cert-body">
      <p class="cert-role">{{post}}<span class="cert-org-inline">&nbsp;&middot;&nbsp;{{organization}}</span></p>
      <p class="cert-event">{{eventName}}</p>
      <p class="cert-summary">{{contributionSummary}}</p>
      {{contributionDetails}}
      <p class="cert-meta">Certificate ID: <strong>{{certificateId}}</strong> &middot; Issued {{issuedAtLong}}</p>
    </div>
    <div class="cert-footer">
      <div class="cert-sigs">{{signatoriesHtml}}</div>
      <div class="cert-qr-wrap">{{qrCode}}<div class="cert-qr-label">Scan to verify</div></div>
    </div>
  </div>
</div>`;

export const DEFAULT_TEMPLATE_CSS = `* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #ffffff; }
body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; }
.cert { width: 1123px; height: 794px; padding: 28px; background: #f7f5ef; }
.cert-border { position: relative; width: 100%; height: 100%; border: 3px solid #0f766e; outline: 1px solid #c9a227; outline-offset: -10px; padding: 48px 64px; display: flex; flex-direction: column; align-items: center; background: #fffdf7; }
.cert-top { display: flex; align-items: center; gap: 14px; }
.cert-logo { width: 54px; height: 54px; object-fit: contain; }
.cert-org { font-size: 20px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #0f766e; }
.cert-title { margin-top: 22px; font-family: Georgia, 'Times New Roman', serif; font-size: 58px; letter-spacing: 10px; font-weight: 700; color: #0f766e; }
.cert-subtitle { font-size: 16px; letter-spacing: 8px; color: #c9a227; font-weight: 700; }
.cert-intro { margin-top: 26px; font-size: 17px; letter-spacing: 2px; color: #555; }
.cert-name { margin-top: 10px; font-family: Georgia, 'Times New Roman', serif; font-size: 46px; font-weight: 700; color: #1a1a2e; text-align: center; }
.cert-rule { width: 62%; height: 2px; background: linear-gradient(90deg, transparent, #c9a227, transparent); margin: 10px 0 18px; }
.cert-body { text-align: center; font-size: 16px; line-height: 1.6; max-width: 760px; color: #333; }
.cert-body p { margin: 6px 0; }
.contrib-list { list-style: none; margin: 10px 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 22px; font-size: 14px; }
.contrib-list li { background: #0f766e0d; border: 1px solid #0f766e26; border-radius: 999px; padding: 4px 12px; }
.cert-meta { font-size: 12px; color: #777; margin-top: 14px !important; }
.cert-footer { margin-top: auto; width: 100%; display: flex; align-items: flex-end; justify-content: space-between; }
.cert-sigs { display: flex; gap: 46px; }
.sig { text-align: center; min-width: 160px; }
.sig-line { width: 160px; height: 1px; background: #1a1a2e; margin: 0 auto 8px; }
.sig-name { font-weight: 700; font-size: 14px; }
.sig-title { font-size: 12px; color: #555; }
.sig-designation { font-size: 11px; color: #888; }
.cert-qr-wrap { text-align: center; }
.cert-qr { width: 86px; height: 86px; display: block; }
.cert-qr-label { font-size: 9px; color: #888; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }
@media print { .cert { width: 100%; height: 100vh; } }`;
