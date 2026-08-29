export interface EmailTheme {
  appName: string;
  tagline: string;
  logoUrl: string;
  primaryColor: string;
  headerBg: string;
  bodyBg: string;
  cardBg: string;
  textColor: string;
  mutedColor: string;
  footerText: string;
  senderName: string;
  whatsapp: string;
  telegram: string;
  supportEmail: string;
  whatsappChannel: string;
  whatsappCommunity: string;
  telegramChannel: string;
  telegramGroup: string;
  telegramBot: string;
  supportUrl: string;
}

export interface EmailTemplate {
  key: string;
  label: string;
  subject: string;
  body: string;
}

export interface EmailSettings {
  theme: EmailTheme;
  templates: EmailTemplate[];
  defaultTemplate: string;
}

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  theme: {
    appName: 'IIUC-ARMS',
    tagline: 'Academic Resource Management System',
    logoUrl: '/arms-logo-icon.png',
    primaryColor: '#22c55e',
    headerBg: '#0a0f1e',
    bodyBg: '#0a0f1e',
    cardBg: '#111827',
    textColor: '#e8edf5',
    mutedColor: '#94a3b8',
    footerText: 'Quranic Sciences & Islamic Studies (QSIS) · International Islamic University Chittagong',
    senderName: '',
    whatsapp: '',
    telegram: '',
    supportEmail: '',
    whatsappChannel: '',
    whatsappCommunity: 'https://chat.whatsapp.com/JQbkkwbDTvj9G0Xly9N771',
    telegramChannel: 'https://t.me/iiuc_arms',
    telegramGroup: 'https://t.me/iiuc_arms_chat',
    telegramBot: 'https://t.me/iiuc_arms_bot',
    supportUrl: 'https://iiuc-arms.eu.cc/support',
  },
  templates: [
    {
      key: 'verify',
      label: 'Ask University ID',
      subject: 'Verify your account — {{appName}}',
      body: 'Hi {{name}},\n\nYou signed in to {{appName}} ({{tagline}}) with your personal email: {{email}}.\n\nTo finish verifying your account, please reply to this email with your IIUC Student / Employee ID, or sign in with your university email (e.g. name@ugrad.iiuc.ac.bd).\n\nUniversity accounts are pre-approved, so you can get in immediately. If you already signed up with your personal email, we can link your university email afterwards.\n\nThanks,\n{{senderName}}',
    },
    {
      key: 'welcome',
      label: 'Welcome',
      subject: 'Welcome to {{appName}}!',
      body: 'Hi {{name}},\n\nYour {{appName}} account has been approved. Welcome aboard!\n\nYou can now sign in and explore all the academic resources, routines and tools available to you.\n\nIf you need any help, just reply to this email or reach us on the contact details below.\n\nThanks,\n{{senderName}}',
    },
    {
      key: 'notice',
      label: 'Notice',
      subject: 'Notice from {{appName}}',
      body: 'Hi {{name}},\n\n{{message}}\n\nThanks,\n{{senderName}}',
    },
    {
      key: 'announce',
      label: 'Announcement',
      subject: 'Announcement from {{appName}}',
      body: 'Hi {{name}},\n\n{{message}}\n\nFor updates, announcements and community discussion, join our official channels below — or open the support page if you need any help.\n\nThanks,\n{{senderName}}',
    },
  ],
  defaultTemplate: 'verify',
};

export const EMAIL_PLACEHOLDERS: { token: string; label: string }[] = [
  { token: '{{name}}', label: 'Recipient name' },
  { token: '{{email}}', label: 'Recipient email' },
  { token: '{{universityId}}', label: 'Recipient university ID' },
  { token: '{{role}}', label: 'Recipient role' },
  { token: '{{message}}', label: 'Custom message' },
  { token: '{{appName}}', label: 'App name' },
  { token: '{{tagline}}', label: 'Tagline' },
  { token: '{{senderName}}', label: 'Sender name' },
  { token: '{{senderEmail}}', label: 'Sender email' },
  { token: '{{whatsapp}}', label: 'Sender WhatsApp' },
  { token: '{{telegram}}', label: 'Sender Telegram' },
  { token: '{{supportEmail}}', label: 'Support email' },
  { token: '{{supportUrl}}', label: 'Support page link' },
];

export function mergeEmailSettings(partial?: Partial<EmailSettings> | null): EmailSettings {
  const p = partial || {};
  const theme = { ...DEFAULT_EMAIL_SETTINGS.theme, ...(p.theme || {}) };
  const templates = Array.isArray(p.templates) && p.templates.length > 0 ? p.templates : DEFAULT_EMAIL_SETTINGS.templates;
  const known = new Set(templates.map(t => t.key));
  const merged = templates.concat(DEFAULT_EMAIL_SETTINGS.templates.filter(t => !known.has(t.key)));
  return {
    theme,
    templates: merged,
    defaultTemplate: p.defaultTemplate || DEFAULT_EMAIL_SETTINGS.defaultTemplate,
  };
}

export function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const EMAIL_VARS = (settings: EmailSettings, opts: { name?: string; email?: string; universityId?: string; role?: string; message?: string; senderEmail?: string } = {}) => {
  const t = settings.theme;
  return {
    name: opts.name || 'there',
    email: opts.email || '',
    universityId: opts.universityId || '',
    role: opts.role || '',
    message: opts.message || '',
    appName: t.appName,
    tagline: t.tagline,
    senderName: t.senderName || t.appName,
    senderEmail: opts.senderEmail || t.supportEmail,
    whatsapp: t.whatsapp,
    telegram: t.telegram,
    supportEmail: t.supportEmail,
    supportUrl: t.supportUrl,
  };
};

export function renderEmailHtml(settings: EmailSettings, tpl: EmailTemplate, opts: { name?: string; email?: string; universityId?: string; role?: string; message?: string; senderEmail?: string; origin?: string } = {}): string {
  const t = settings.theme;
  const vars = EMAIL_VARS(settings, opts);
  const subject = escapeHtml(interpolate(tpl.subject, vars));
  const body = escapeHtml(interpolate(tpl.body, vars));
  const paragraphs = body
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, '<br/>'))
    .map(p => `<p style="margin:0 0 16px 0;line-height:1.7;font-size:15px;color:${t.textColor}">${p}</p>`)
    .join('');
  const origin = opts.origin || 'https://iiuc-arms.eu.cc';
  const logo = t.logoUrl ? (t.logoUrl.startsWith('http') ? t.logoUrl : `${origin}${t.logoUrl}`) : `${origin}/arms-logo-icon.png`;

  const contactChips: string[] = [];
  if (t.whatsapp) {
    const wa = t.whatsapp.replace(/\D/g, '');
    contactChips.push(`<a href="https://wa.me/${wa}" style="display:inline-block;padding:7px 14px;margin:4px;border-radius:9999px;background:${t.primaryColor}22;color:${t.primaryColor};text-decoration:none;font-size:12px;font-weight:600">WhatsApp</a>`);
  }
  if (t.telegram) {
    const tg = t.telegram.startsWith('@') ? t.telegram.slice(1) : t.telegram;
    contactChips.push(`<a href="https://t.me/${tg}" style="display:inline-block;padding:7px 14px;margin:4px;border-radius:9999px;background:${t.primaryColor}22;color:${t.primaryColor};text-decoration:none;font-size:12px;font-weight:600">Telegram</a>`);
  }
  if (t.supportEmail) {
    contactChips.push(`<a href="mailto:${t.supportEmail}" style="display:inline-block;padding:7px 14px;margin:4px;border-radius:9999px;background:${t.primaryColor}22;color:${t.primaryColor};text-decoration:none;font-size:12px;font-weight:600">Email Support</a>`);
  }

  // Community & help links — automatically attached to every email so
  // recipients know where to get updates and support.
  const helpChips: string[] = [];
  const helpLinks: { href: string; label: string }[] = [
    { href: t.whatsappChannel, label: 'WhatsApp Channel' },
    { href: t.whatsappCommunity, label: 'WhatsApp Community' },
    { href: t.telegramChannel, label: 'Telegram Channel' },
    { href: t.telegramGroup, label: 'Telegram Group' },
    { href: t.telegramBot, label: 'Telegram Bot' },
    { href: t.supportUrl, label: 'Get Help' },
  ];
  for (const link of helpLinks) {
    if (!link.href) continue;
    helpChips.push(`<a href="${escapeHtml(link.href)}" style="display:inline-block;padding:7px 14px;margin:4px;border-radius:9999px;background:${t.primaryColor}22;color:${t.primaryColor};text-decoration:none;font-size:12px;font-weight:600;border:1px solid ${t.primaryColor}33">${link.label}</a>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:${t.bodyBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${t.bodyBg}">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${t.headerBg};border-radius:16px 16px 0 0;border-top:3px solid ${t.primaryColor}">
          <tr>
            <td align="center" style="padding:28px 24px 20px 24px">
              <img src="${logo}" alt="${escapeHtml(t.appName)}" width="64" height="64" style="display:block;width:64px;height:64px;border-radius:14px;object-fit:cover"/>
              <div style="margin-top:12px;font-size:20px;font-weight:700;color:${t.textColor}">${escapeHtml(t.appName)}</div>
              <div style="font-size:12px;color:${t.mutedColor}">${escapeHtml(t.tagline)}</div>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${t.cardBg};border-radius:0 0 16px 16px">
          <tr>
            <td style="padding:24px 28px 8px 28px">${paragraphs}</td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 28px 8px 28px">${contactChips.join('')}</td>
          </tr>
          ${helpChips.length > 0 ? `
          <tr>
            <td style="padding:0 28px 4px 28px">
              <div style="font-size:11px;color:${t.mutedColor};text-align:center;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:4px">Get updates &amp; support</div>
              <div style="text-align:center">${helpChips.join('')}</div>
            </td>
          </tr>` : ''}
          <tr>
            <td style="padding:16px 28px 24px 28px;border-top:1px solid ${t.primaryColor}22">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="font-size:12px;color:${t.mutedColor};line-height:1.6">
                    ${escapeHtml(t.footerText)}
                    <br/>
                    <span style="color:${t.primaryColor}">${escapeHtml(t.appName)}</span> &nbsp;·&nbsp; ${new Date().getFullYear()}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function emailPlainParts(settings: EmailSettings, tpl: EmailTemplate, opts: { name?: string; email?: string; universityId?: string; role?: string; message?: string; senderEmail?: string } = {}): { subject: string; body: string } {
  const vars = EMAIL_VARS(settings, opts);
  const body = interpolate(tpl.body, vars);
  const subject = interpolate(tpl.subject, vars);
  const footer: string[] = [
    `—`,
    `${settings.theme.appName} · ${settings.theme.tagline}`,
  ];
  if (settings.theme.senderName) footer.push(`Sent by ${settings.theme.senderName}`);
  if (settings.theme.whatsapp) footer.push(`WhatsApp: ${settings.theme.whatsapp}`);
  if (settings.theme.telegram) footer.push(`Telegram: ${settings.theme.telegram}`);
  if (settings.theme.supportEmail) footer.push(`Email: ${settings.theme.supportEmail}`);
  if (settings.theme.supportUrl) footer.push(`Support: ${settings.theme.supportUrl}`);

  const community: string[] = [];
  if (settings.theme.telegramChannel) community.push(`Telegram Channel: ${settings.theme.telegramChannel}`);
  if (settings.theme.telegramGroup) community.push(`Telegram Group: ${settings.theme.telegramGroup}`);
  if (settings.theme.telegramBot) community.push(`Telegram Bot: ${settings.theme.telegramBot}`);
  if (settings.theme.whatsappCommunity) community.push(`WhatsApp Community: ${settings.theme.whatsappCommunity}`);
  if (settings.theme.whatsappChannel) community.push(`WhatsApp Channel: ${settings.theme.whatsappChannel}`);
  if (community.length > 0) {
    footer.push(`Get updates & support:`, ...community.map(c => `• ${c}`));
  }
  footer.push(settings.theme.footerText);
  return { subject, body: `${body.trim()}\n\n${footer.join('\n')}\n` };
}