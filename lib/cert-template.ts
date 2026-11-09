// Shared HTML/CSS certificate template engine.
// Templates use {{placeholder}} tokens which are replaced at render time.

export interface CertTemplateAttribute {
  key: string;
  label: string;
  group: 'certificate' | 'recipient' | 'organization' | 'contributor' | 'system';
  sample: string;
  description: string;
}

export const CERT_TEMPLATE_ATTRIBUTES: CertTemplateAttribute[] = [
  { key: 'certificateId', label: 'Certificate ID', group: 'certificate', sample: 'IIUC-XKMR-B572-ETGQ', description: 'Unique certificate ID printed on the certificate and used by the verification page.' },
  { key: 'memberName', label: 'Recipient name', group: 'recipient', sample: 'Sayed Atiqur Rahman', description: 'Full name of the recipient as it should appear on the certificate.' },
  { key: 'universityId', label: 'University ID', group: 'recipient', sample: 'C243155', description: "Recipient's university/student ID." },
  { key: 'department', label: 'Department', group: 'recipient', sample: 'Computer Science & Engineering', description: 'Department name of the recipient.' },
  { key: 'session', label: 'Session', group: 'recipient', sample: '2022-2023', description: 'Academic session or batch (may be empty).' },
  { key: 'post', label: 'Post / role', group: 'recipient', sample: 'General Secretary', description: "Recipient's post, role or designation in the organization." },
  { key: 'eventName', label: 'Event name', group: 'certificate', sample: 'Annual Programming Contest', description: 'Event/program name (empty for contributor certificates).' },
  { key: 'servicePeriod', label: 'Service period', group: 'certificate', sample: 'Jan 2025 – Dec 2025', description: 'Period of service or contribution.' },
  { key: 'organization', label: 'Organization / club', group: 'organization', sample: 'IIUC Computer Club', description: 'Issuing organization/club name. Contributor certificates use "IIUC-ARMS".' },
  { key: 'organizationLogo', label: 'Organization logo URL', group: 'organization', sample: '/arms-logo-icon.png', description: 'Logo URL of the issuing organization. Contributor certificates default to /arms-logo-icon.png (the IIUC-ARMS app logo); university seals use /iiuc-logo.png.' },
  { key: 'issuedBy', label: 'Issued by', group: 'organization', sample: 'IIUC-ARMS', description: 'Name/email of the issuer.' },
  { key: 'issuedAt', label: 'Issue date', group: 'certificate', sample: '2026-11-08', description: 'Issue date in YYYY-MM-DD format.' },
  { key: 'issuedAtLong', label: 'Issue date (long)', group: 'certificate', sample: 'November 8, 2026', description: 'Issue date in long human-readable format.' },
  { key: 'signatoriesHtml', label: 'Signatories block (HTML)', group: 'system', sample: '<div class="sig">...</div>', description: 'Ready-made HTML block with every signatory (name, title, designation). Place it where the signature line belongs.' },
  { key: 'qrCode', label: 'Verification QR code (HTML)', group: 'system', sample: '<img src="data:image/png;base64,...">', description: 'Ready-made <img> QR code linking to the public verification page.' },
  { key: 'verifyUrl', label: 'Verification URL', group: 'system', sample: 'https://arms.iiuc.net/clubs/preview/IIUC-...', description: 'Plain verification URL. Use it in a link; use {{qrCode}} for the QR image.' },
  { key: 'siteUrl', label: 'Site URL', group: 'system', sample: 'https://arms.iiuc.net', description: 'Base URL of the IIUC-ARMS site.' },
  { key: 'githubLogin', label: 'GitHub username', group: 'contributor', sample: 'sayedatiqurrahman', description: "Contributor's GitHub username." },
  { key: 'githubUrl', label: 'GitHub profile URL', group: 'contributor', sample: 'https://github.com/sayedatiqurrahman', description: "Contributor's GitHub profile URL." },
  { key: 'avatarUrl', label: 'GitHub avatar URL', group: 'contributor', sample: 'https://avatars.githubusercontent.com/u/...', description: "Contributor's GitHub avatar image URL." },
  { key: 'role', label: 'Contributor role', group: 'contributor', sample: 'Founder & Lead', description: 'Contributor role (same value as post for contributor certificates).' },
  { key: 'codeCommits', label: 'Code commits', group: 'contributor', sample: '656', description: 'Number of commits to the source-code repository.' },
  { key: 'dataCommits', label: 'Data commits', group: 'contributor', sample: '231', description: 'Number of commits/files contributed to the academic-files repository.' },
  { key: 'totalCommits', label: 'Total commits', group: 'contributor', sample: '887', description: 'Total commits across both repositories.' },
  { key: 'issueContributions', label: 'Issues opened', group: 'contributor', sample: '12', description: 'Number of GitHub issues opened.' },
  { key: 'designContributions', label: 'Designs published', group: 'contributor', sample: '3', description: 'Number of Creative Hub designs published.' },
  { key: 'prCount', label: 'Pull requests', group: 'contributor', sample: '4', description: 'Number of pull requests.' },
  { key: 'totalContributions', label: 'Total contributions', group: 'contributor', sample: '902', description: 'Overall contribution score (commits + issues + designs).' },
  { key: 'contributionSummary', label: 'Contribution summary', group: 'contributor', sample: '887 commits · 12 issues · 3 designs', description: 'Short human-readable contribution summary. Empty for club/studio certificates.' },
  { key: 'contributionDetails', label: 'Contribution details (HTML)', group: 'contributor', sample: '<ul class="contrib-list">...</ul>', description: 'Ready-made HTML list with the contribution breakdown.' },
  { key: 'firstContribution', label: 'First contribution', group: 'contributor', sample: 'Jan 2024', description: 'Month/year of the first contribution.' },
  { key: 'lastContribution', label: 'Latest contribution', group: 'contributor', sample: 'Nov 2026', description: 'Month/year of the latest contribution.' },
  { key: 'founderName', label: 'Founder name', group: 'organization', sample: 'Sayed Atiqur Rahman', description: "Founder's name, for signature blocks." },
  { key: 'founderTitle', label: 'Founder title', group: 'organization', sample: 'Founder, IIUC-ARMS', description: "Founder's title." },
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
      (s) => `<div class="sig">` +
        (s.signatureUrl ? `<img class="sig-image" src="${escapeHtml(s.signatureUrl)}" alt="" />` : '') +
        `<div class="sig-line"></div><div class="sig-name">${escapeHtml(s.name)}</div>` +
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
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Dynalight&family=Great+Vibes&family=Allura&family=Cinzel:wght@500;600;700&family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=Dancing+Script:wght@600;700&display=swap" rel="stylesheet" />
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
.cert-name { margin-top: 8px; font-family: 'Dynalight', 'Great Vibes', cursive; font-size: 62px; font-weight: 400; line-height: 1.05; color: #1a1a2e; text-align: center; word-break: break-word; }
.cert-org-inline { color: #555; font-size: 14px; }
.cert-rule { width: 62%; height: 2px; background: linear-gradient(90deg, transparent, #c9a227, transparent); margin: 10px 0 18px; }
.cert-body { text-align: center; font-size: 16px; line-height: 1.6; max-width: 760px; color: #333; }
.cert-body p { margin: 6px 0; }
.contrib-list { list-style: none; margin: 10px 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 22px; font-size: 14px; }
.contrib-list li { background: #0f766e0d; border: 1px solid #0f766e26; border-radius: 999px; padding: 4px 12px; }
.cert-meta { font-size: 12px; color: #777; margin-top: 14px !important; }
.cert-footer { margin-top: auto; width: 100%; display: flex; align-items: flex-end; justify-content: space-between; }
.cert-sigs { display: flex; gap: 46px; }
.sig { text-align: center; min-width: 160px; }
.sig-image { display: block; height: 34px; max-width: 150px; object-fit: contain; margin: 0 auto 2px; }
.sig-line { width: 160px; height: 1px; background: #1a1a2e; margin: 0 auto 8px; }
.sig-name { font-weight: 700; font-size: 14px; }
.sig-title { font-size: 12px; color: #555; }
.sig-designation { font-size: 11px; color: #888; }
.cert-qr-wrap { text-align: center; }
.cert-qr { width: 86px; height: 86px; display: block; }
.cert-qr-label { font-size: 9px; color: #888; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }
@media print { .cert { width: 100%; height: 100vh; } }`;

// ---------------------------------------------------------------------------
// Built-in contributor certificate
//
// Contributor certificates are recognition from IIUC-ARMS as a whole (not a
// club and not a department). This design is used automatically unless the
// admin selects a custom contributor template.
// ---------------------------------------------------------------------------

export const CONTRIBUTOR_TEMPLATE_HTML = `<div class="cc-cert">
  <div class="cc-frame">
    <header class="cc-head">
      <div class="cc-brand">
        <img class="cc-logo" src="{{organizationLogo}}" alt="" />
        <div>
          <div class="cc-brand-name">IIUC-ARMS</div>
          <div class="cc-brand-sub">Presented by Programming Light</div>
        </div>
      </div>
      <div class="cc-badge">Contributor</div>
    </header>

    <main class="cc-main">
      <div class="cc-kicker">Certificate of Recognition</div>
      <h1 class="cc-title">CONTRIBUTOR CERTIFICATE</h1>
      <p class="cc-intro">This certificate is proudly presented to</p>
      <div class="cc-name">{{memberName}}</div>
      <div class="cc-rule"></div>
      <p class="cc-text">
        in recognition of outstanding open-source contributions to
        <strong>IIUC-ARMS</strong> and the IIUC student community.
      </p>
      <p class="cc-role">{{post}}<span class="cc-dot">&bull;</span>IIUC-ARMS</p>

      <div class="cc-highlights">{{contributionDetails}}</div>
      <p class="cc-note">{{contributionSummary}}</p>
    </main>

    <footer class="cc-foot">
      <div class="cc-signature">{{signatoriesHtml}}</div>
      <div class="cc-qr-box">
        {{qrCode}}
        <span>Scan to verify</span>
      </div>
    </footer>

    <div class="cc-meta">
      <span>Certificate ID: <strong>{{certificateId}}</strong></span>
      <span>Issued {{issuedAtLong}}</span>
      <span>Verified at arms.iiuc.net</span>
    </div>
  </div>
</div>`;

export const CONTRIBUTOR_TEMPLATE_CSS = `* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #eef4f1; }
body { font-family: 'Segoe UI', Arial, sans-serif; color: #17252b; }
.cc-cert { width: 1123px; height: 794px; padding: 22px; background: #eef4f1; }
.cc-frame { position: relative; width: 100%; height: 100%; padding: 34px 52px 22px; background: #fffdf8; border: 2px solid #0f766e; border-radius: 6px; display: flex; flex-direction: column; overflow: hidden; }
.cc-frame::before { content: ''; position: absolute; inset: 9px; border: 1px solid #c9a227; pointer-events: none; }
.cc-head { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.cc-brand { display: flex; align-items: center; gap: 14px; }
.cc-logo { width: 54px; height: 54px; object-fit: contain; }
.cc-brand-name { font-size: 22px; font-weight: 800; letter-spacing: 3.5px; color: #0f766e; line-height: 1.1; }
.cc-brand-sub { margin-top: 3px; font-size: 9.5px; letter-spacing: 2.2px; text-transform: uppercase; color: #8a7a3f; }
.cc-badge { padding: 6px 14px; border: 1px solid #0f766e55; border-radius: 999px; background: #0f766e0d; color: #0f766e; font-size: 9.5px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
.cc-main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 6px 54px 0; }
.cc-kicker { font-family: Georgia, 'Times New Roman', serif; font-size: 12.5px; letter-spacing: 5px; text-transform: uppercase; color: #8a7a3f; }
.cc-title { margin: 7px 0 0; font-family: Georgia, 'Times New Roman', serif; font-size: 33px; font-weight: 700; letter-spacing: 3.6px; color: #12343b; }
.cc-intro { margin: 15px 0 0; font-size: 13.5px; letter-spacing: 1.2px; color: #5e7177; }
.cc-name { margin-top: 2px; font-family: 'Dynalight', cursive; font-size: 66px; font-weight: 400; line-height: 1.05; color: #102a30; word-break: break-word; }
.cc-rule { width: 310px; height: 2px; margin: 8px auto 12px; background: linear-gradient(90deg, transparent, #c9a227, transparent); }
.cc-text { max-width: 730px; margin: 0; font-size: 14px; line-height: 1.65; color: #44565c; }
.cc-text strong { color: #0f766e; }
.cc-role { margin: 11px 0 0; font-size: 10.5px; font-weight: 700; letter-spacing: 1.7px; text-transform: uppercase; color: #0f766e; }
.cc-dot { margin: 0 7px; color: #c9a227; }
.cc-highlights { margin-top: 14px; }
.contrib-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 7px; max-width: 850px; }
.contrib-list li { padding: 5px 11px; border: 1px solid #0f766e26; border-radius: 999px; background: #0f766e0a; color: #3c5057; font-size: 10.8px; }
.contrib-list li strong { color: #0f766e; font-size: 12px; }
.cc-note { margin: 9px 0 0; font-size: 10.5px; letter-spacing: 0.3px; color: #819196; }
.cc-foot { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding-top: 12px; }
.cc-signature { min-width: 300px; text-align: center; }
.cc-signature .sig { text-align: center; }
.sig-image { display: block; height: 42px; max-width: 200px; object-fit: contain; margin: 0 auto 1px; }
.sig-line { width: 210px; height: 1px; background: #1a2a2a; margin: 0 auto 7px; }
.sig-name { font-size: 13px; font-weight: 700; color: #102a30; }
.sig-title { margin-top: 2px; font-size: 10.5px; color: #53666c; }
.sig-designation { margin-top: 1px; font-size: 9.5px; letter-spacing: 0.8px; color: #8a7a3f; }
.cc-qr-box { text-align: center; }
.cc-qr-box .cert-qr { width: 78px; height: 78px; display: block; margin: 0 auto; }
.cc-qr-box span { display: block; margin-top: 4px; font-size: 8.5px; letter-spacing: 1.2px; text-transform: uppercase; color: #819196; }
.cc-meta { display: flex; justify-content: space-between; gap: 18px; margin-top: 10px; padding-top: 7px; border-top: 1px solid #0f766e22; font-size: 9px; letter-spacing: 0.4px; color: #819196; }
.cc-meta strong { color: #44565c; }
@media print { .cc-cert { width: 100%; height: 100vh; } }`;

// ---------------------------------------------------------------------------
// Single-file theme format
//
// A certificate theme can be exported as one complete .html file that contains
// the design markup, its internal CSS, and a commented attribute guide. The
// same file can be imported back into the editor. This keeps "one HTML file
// bears everything related to a certificate theme" true for both humans and
// the application.
// ---------------------------------------------------------------------------

export const EXAMPLE_TEMPLATE_HTML = `<!--
  IIUC-ARMS CERTIFICATE THEME - WORKING EXAMPLE
  ================================================
  This is a complete example design. Download it, edit it, and upload it back.
  Every {{placeholder}} below is a data input filled by the application.
  The attribute guide above lists every available input with an explanation.
-->
<div class="cert">
  <div class="cert-border">

    <!-- [ORGANIZATION LOGO] {{organizationLogo}} = logo URL of the issuer.
         Use /iiuc-logo.png for IIUC-ARMS certificates, or a full URL. -->
    <div class="cert-top">
      <img class="cert-logo" src="{{organizationLogo}}" alt="" />

      <!-- [ORGANIZATION NAME] {{organization}} = club name,
           or "IIUC-ARMS" for contributor certificates. -->
      <div class="cert-org">{{organization}}</div>
    </div>

    <!-- [TITLE] Static text. Change it freely; no data input needed. -->
    <div class="cert-title">CERTIFICATE</div>
    <div class="cert-subtitle">OF APPRECIATION</div>

    <div class="cert-intro">This is to certify that</div>

    <!-- [RECIPIENT NAME] {{memberName}} = the person receiving the certificate. -->
    <div class="cert-name">{{memberName}}</div>
    <div class="cert-rule"></div>

    <div class="cert-body">
      <!-- [POST / ROLE] {{post}} = e.g. General Secretary, or a contributor role.
           [ORGANIZATION, INLINE] {{organization}} is repeated on the role line. -->
      <p class="cert-role">{{post}}<span class="cert-org-inline">&nbsp;&middot;&nbsp;{{organization}}</span></p>

      <!-- [EVENT NAME] {{eventName}} = contest/program name.
           Renders empty for contributor certificates. -->
      <p class="cert-event">{{eventName}}</p>

      <!-- [CONTRIBUTION SUMMARY] {{contributionSummary}} = short text such as
           "887 commits · 12 issues". Renders empty for club/studio certificates. -->
      <p class="cert-summary">{{contributionSummary}}</p>

      <!-- [CONTRIBUTION DETAILS] {{contributionDetails}} = ready-made HTML <ul>
           with the breakdown. Place it where the badges should appear. -->
      {{contributionDetails}}

      <!-- [CERTIFICATE META] {{certificateId}} = unique ID.
           {{issuedAtLong}} = long issue date. -->
      <p class="cert-meta">Certificate ID: <strong>{{certificateId}}</strong> &middot; Issued {{issuedAtLong}}</p>
    </div>

    <div class="cert-footer">
      <!-- [SIGNATORIES] {{signatoriesHtml}} = ready-made HTML with every
           signatory name/title/designation. Put it where signatures belong. -->
      <div class="cert-sigs">{{signatoriesHtml}}</div>

      <!-- [QR CODE] {{qrCode}} = ready-made <img> that links to verification.
           [VERIFY LINK] {{verifyUrl}} = plain URL if you prefer a text link. -->
      <div class="cert-qr-wrap">{{qrCode}}<div class="cert-qr-label">Scan to verify</div></div>
    </div>

  </div>
</div>`;

export const EXAMPLE_TEMPLATE_CSS = `/*
  IIUC-ARMS CERTIFICATE THEME - EXAMPLE STYLES
  --------------------------------------------
  This <style> block is the internal CSS for the theme. It is intentionally
  included inside the same .html file, so the whole design is portable.

  Tip: use the class names from the example markup, or add your own.
  Keep the artboard at 1123 x 794 px (A4 landscape) for best output.
*/
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #ffffff; }
body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; }

/* Outer artboard + decorative border */
.cert { width: 1123px; height: 794px; padding: 28px; background: #f7f5ef; }
.cert-border { position: relative; width: 100%; height: 100%; border: 3px solid #0f766e; outline: 1px solid #c9a227; outline-offset: -10px; padding: 48px 64px; display: flex; flex-direction: column; align-items: center; background: #fffdf7; }

/* Issuer header */
.cert-top { display: flex; align-items: center; gap: 14px; }
.cert-logo { width: 54px; height: 54px; object-fit: contain; }
.cert-org { font-size: 20px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #0f766e; }

/* Title block */
.cert-title { margin-top: 22px; font-family: Georgia, 'Times New Roman', serif; font-size: 58px; letter-spacing: 10px; font-weight: 700; color: #0f766e; }
.cert-subtitle { font-size: 16px; letter-spacing: 8px; color: #c9a227; font-weight: 700; }
.cert-intro { margin-top: 26px; font-size: 17px; letter-spacing: 2px; color: #555; }
.cert-name { margin-top: 8px; font-family: 'Dynalight', 'Great Vibes', cursive; font-size: 62px; font-weight: 400; line-height: 1.05; color: #1a1a2e; text-align: center; word-break: break-word; }
.cert-org-inline { color: #555; font-size: 14px; }
.cert-rule { width: 62%; height: 2px; background: linear-gradient(90deg, transparent, #c9a227, transparent); margin: 10px 0 18px; }

/* Body: role, event, contribution summary/details, meta */
.cert-body { text-align: center; font-size: 16px; line-height: 1.6; max-width: 760px; color: #333; }
.cert-body p { margin: 6px 0; }
.contrib-list { list-style: none; margin: 10px 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 22px; font-size: 14px; }
.contrib-list li { background: #0f766e0d; border: 1px solid #0f766e26; border-radius: 999px; padding: 4px 12px; }
.cert-meta { font-size: 12px; color: #777; margin-top: 14px !important; }

/* Footer: signatures + verification QR */
.cert-footer { margin-top: auto; width: 100%; display: flex; align-items: flex-end; justify-content: space-between; }
.cert-sigs { display: flex; gap: 46px; }
.sig { text-align: center; min-width: 160px; }
.sig-image { display: block; height: 34px; max-width: 150px; object-fit: contain; margin: 0 auto 2px; }
.sig-line { width: 160px; height: 1px; background: #1a1a2e; margin: 0 auto 8px; }
.sig-name { font-weight: 700; font-size: 14px; }
.sig-title { font-size: 12px; color: #555; }
.sig-designation { font-size: 11px; color: #888; }
.cert-qr-wrap { text-align: center; }
.cert-qr { width: 86px; height: 86px; display: block; }
.cert-qr-label { font-size: 9px; color: #888; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }

/* Printing */
@media print { .cert { width: 100%; height: 100vh; } }`;

const ATTRIBUTE_GROUP_TITLES: Record<CertTemplateAttribute['group'], string> = {
  certificate: 'CERTIFICATE',
  recipient: 'RECIPIENT',
  organization: 'ORGANIZATION',
  contributor: 'CONTRIBUTOR',
  system: 'SYSTEM / READY-MADE HTML',
};

export function buildAttributeGuideComment(): string {
  const lines: string[] = [];
  for (const group of Object.keys(ATTRIBUTE_GROUP_TITLES) as CertTemplateAttribute['group'][]) {
    const attrs = CERT_TEMPLATE_ATTRIBUTES.filter((a) => a.group === group);
    if (attrs.length === 0) continue;
    lines.push(`  ${ATTRIBUTE_GROUP_TITLES[group]}`);
    for (const a of attrs) {
      const token = `{{${a.key}}}`.padEnd(30, ' ');
      lines.push(`    ${token} - ${a.description}  (e.g. "${a.sample}")`);
    }
    lines.push('');
  }
  return `<!--
  ============================================================================
  IIUC-ARMS CERTIFICATE THEME - SINGLE FILE FORMAT
  ============================================================================
  This single HTML file contains everything about this certificate design:
    * <style> ... </style>  : internal CSS (the visual design)
    * <body> ... </body>    : certificate layout and markup
    * {{attribute}}         : data inputs replaced when a certificate is issued

  Inline style="..." attributes are also supported. JavaScript is not allowed
  and is stripped automatically for security.

  Keep the artboard at 1123 x 794 px (A4 landscape) for the best results.
  Unknown placeholders render as empty text; empty fields render as blank.

  ============================================================================
  ATTRIBUTE GUIDE - each {{...}} is a data input, and here is why it exists
  ============================================================================
${lines.join('\n')}  ============================================================================
  TIPS
  ============================================================================
    * {{qrCode}} and {{signatoriesHtml}} output ready-made HTML. Place them
      exactly where the QR code and signature block should appear.
    * {{contributionDetails}} outputs a ready-made <ul> with the breakdown.
    * Use {{verifyUrl}} inside an <a href="..."> link for a text verify link.
    * Do not add <script>, <iframe>, <form>, <input>, <link> or <meta> tags.
      They are removed automatically.
  ============================================================================
-->`;
}

export interface TemplateFileOptions {
  name?: string;
  html: string;
  css: string;
}

export function buildTemplateFile(opts: TemplateFileOptions): string {
  const title = (opts.name || '').trim() || 'IIUC-ARMS Certificate Theme';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
${opts.css || ''}
</style>
</head>
<body>
${buildAttributeGuideComment()}

${opts.html || ''}
</body>
</html>`;
}

export function buildExampleTemplateFile(): string {
  return buildTemplateFile({
    name: 'IIUC-ARMS Certificate Theme - Example',
    html: EXAMPLE_TEMPLATE_HTML,
    css: EXAMPLE_TEMPLATE_CSS,
  });
}

export function templateFileName(name?: string): string {
  const base = String(name || 'certificate-theme')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'certificate-theme'}.html`;
}

function stripAutoGuideComments(input: string): string {
  return String(input || '').replace(
    /<!--[\s\S]*?IIUC-ARMS CERTIFICATE THEME[\s\S]*?-->/gi,
    '',
  );
}

export interface ParsedTemplateFile {
  html: string;
  css: string;
  name: string;
}

// Parse a single-file theme back into { html, css, name }. Works in the
// browser (DOMParser) and falls back to regex in non-DOM runtimes.
export function parseTemplateFile(content: string): ParsedTemplateFile {
  const source = String(content || '');

  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const name = doc.querySelector('title')?.textContent?.trim() || '';
    const css = Array.from(doc.querySelectorAll('style'))
      .map((el) => el.textContent || '')
      .join('\n')
      .trim();
    doc.querySelectorAll('style, script, link[rel="stylesheet"]').forEach((el) => el.remove());
    const html = stripAutoGuideComments(doc.body ? doc.body.innerHTML : '').trim();
    return { html, css, name };
  }

  const styles: string[] = [];
  let remainder = source.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, css) => {
    styles.push(css);
    return '';
  });
  const titleMatch = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  // Locate <body> while ignoring tag-like text inside comments.
  const masked = remainder.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));
  const bodyMatch = masked.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch && bodyMatch.index !== undefined && bodyMatch[1] !== undefined && bodyMatch[1].trim()) {
    const contentStart = bodyMatch.index + bodyMatch[0].indexOf(bodyMatch[1]);
    remainder = remainder.slice(contentStart, contentStart + bodyMatch[1].length);
  }
  remainder = remainder
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?html\b[^>]*>/gi, '');

  return {
    html: stripAutoGuideComments(remainder).trim(),
    css: styles.join('\n').trim(),
    name: (titleMatch?.[1] || '').trim(),
  };
}
