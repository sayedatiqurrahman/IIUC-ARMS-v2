import { NextRequest, NextResponse } from 'next/server';
import {
  sendMessage,
  sendChatAction,
  answerCallbackQuery,
  editMessageText,
  deleteMessage,
  getGithubTree,
  findCourseFiles,
  findCourseLocations,
  getCourseInfo,
  buildWelcomeMessage,
  buildHelpMessage,
  buildConnectMessage,
  buildCourseResult,
  buildCategoryResult,
  buildDeptList,
  buildSemesterList,
  buildSearchResults,
  buildCourseLink,
  buildBrowseLink,
  buildCoursesList,
  buildStatsMessage,
  broadcastCallbackData,
  catCallbackData,
  parseCallbackData,
  CATEGORY_META,
  esc,
  getDeptName,
  getDeptFullName,
} from '@/lib/telegram';
import { config } from '@/lib/config';
import { getDepartmentFolder } from '@/lib/departments';
import { getAppInstallations, getInstallationAccessToken } from '@/lib/github-app';
import { deleteCourseFolder } from '@/lib/course-delete';

const COURSE_REGEX = /^[A-Z]{2,5}-?\d{3,5}[A-Z]?$/i;
const GITHUB_API = 'https://api.github.com';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.eu.cc';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function openLink(target: string): string {
  return SITE_URL + '/open?url=' + encodeURIComponent(target);
}

// Resolve a connected admin/requester chat id from a user id (email).
async function resolveRequesterChat(userId: string): Promise<number | null> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId } });
    const chatId = (profile as any)?.telegramChatId;
    return chatId ? Number(chatId) : null;
  } catch { return null; }
}

async function getAppBotToken(): Promise<string | null> {
  try {
    const installations = await getAppInstallations();
    if (!Array.isArray(installations) || installations.length === 0) return null;
    return await getInstallationAccessToken(installations[0].id);
  } catch { return null; }
}

function ghHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

async function getAllFilesInFolder(token: string, folderPath: string): Promise<{ path: string; sha: string }[]> {
  const url = `${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${folderPath}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) return [];
  const items = await res.json();
  if (!Array.isArray(items)) return [];
  const files: { path: string; sha: string }[] = [];
  for (const item of items) {
    if (item.type === 'file') files.push({ path: item.path, sha: item.sha });
    else if (item.type === 'dir') {
      const sub = await getAllFilesInFolder(token, item.path);
      files.push(...sub);
    }
  }
  return files;
}

async function batchDeleteFiles(token: string, files: { path: string; sha: string }[]): Promise<number> {
  if (files.length === 0) return 0;
  const refRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, { headers: ghHeaders(token) });
  if (!refRes.ok) return 0;
  const refData = await refRes.json();
  const baseCommitSha = refData.object.sha;

  const commitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits/${baseCommitSha}`, { headers: ghHeaders(token) });
  if (!commitRes.ok) return 0;
  const commitData = await commitRes.json();
  const baseTreeSha = commitData.tree.sha;

  const fullTreeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees/${baseTreeSha}?recursive=1`, { headers: ghHeaders(token) });
  if (!fullTreeRes.ok) return 0;
  const fullTreeData = await fullTreeRes.json();

  const deletePaths = new Set(files.map(f => f.path));
  const keepItems = (fullTreeData.tree || []).filter((item: any) => !deletePaths.has(item.path));
  if (keepItems.length === 0) return 0;

  const treeItems = keepItems.map((item: any) => ({
    path: item.path, mode: item.mode, type: item.type,
    sha: item.type === 'blob' ? item.sha : undefined,
  }));

  const treeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees`, {
    method: 'POST', headers: ghHeaders(token),
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
  });
  if (!treeRes.ok) return 0;
  const treeData = await treeRes.json();

  const newCommitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits`, {
    method: 'POST', headers: ghHeaders(token),
    body: JSON.stringify({ message: `Delete course: ${files.length} files`, tree: treeData.sha, parents: [baseCommitSha] }),
  });
  if (!newCommitRes.ok) return 0;
  const newCommitData = await newCommitRes.json();

  await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, {
    method: 'PATCH', headers: ghHeaders(token),
    body: JSON.stringify({ sha: newCommitData.sha, force: true }),
  });

  return files.length;
}

// ─── Helper: process email input from user ────────────────────────
async function processConnectEmail(chatId: number, email: string, telegramUsername: string | null) {
  const { prisma } = await import('@/lib/prisma');

  const profile = await prisma.profile.findUnique({
    where: { userId: email },
    select: { userId: true, telegramChatId: true, telegramVerified: true, accountStatus: true },
  });

  if (!profile) {
    await sendMessage(chatId,
      `❌ <b>User doesn't exist</b>\n\n` +
      `No account found for <code>${esc(email)}</code> in IIUC-ARMS.\n\n` +
      `Make sure you registered on IIUC-ARMS with this exact email, or contact the manager/admin.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Only active accounts can connect
  const isOwner = config.ownerEmails.includes(email);
  if (!isOwner && profile.accountStatus !== 'active') {
    const statusLabel = profile.accountStatus === 'pending' ? '⏳ Pending approval' :
      profile.accountStatus === 'rejected' ? '❌ Rejected' :
      profile.accountStatus === 'banned' ? '🚫 Banned' : '⚠️ Unknown status';
    await sendMessage(chatId,
      `❌ <b>Account not approved</b>\n\n` +
      `📧 <code>${esc(email)}</code>\n` +
      `Status: ${statusLabel}\n\n` +
      `Please wait for admin approval or contact support.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (profile.telegramChatId && profile.telegramVerified && profile.telegramChatId !== String(chatId)) {
    await sendMessage(chatId,
      `ℹ️ The email <code>${esc(email)}</code> is already connected to another Telegram account.\n\n` +
      `Use <code>/disconnect</code> on that account first, or contact admin.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (profile.telegramChatId === String(chatId) && profile.telegramVerified) {
    await sendMessage(chatId,
      `✅ <b>Already connected!</b>\n\n` +
      `📧 Account: <code>${esc(email)}</code>\n\n` +
      `You're all set. Use <code>/disconnect</code> if you want to unlink.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // One Telegram account can be linked to up to MAX_ACCOUNTS_PER_CHAT profiles
  const linkedCount = await prisma.profile.count({
    where: {
      telegramChatId: String(chatId),
      telegramVerified: true,
      userId: { not: email },
    },
  });
  if (linkedCount >= 3) {
    await sendMessage(chatId,
      `❌ <b>Limit reached</b>\n\n` +
      `This Telegram is already connected to <b>${linkedCount}</b> accounts (max 3).\n\n` +
      `Please contact the manager/admin to increase your limit.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  await prisma.profile.update({
    where: { userId: email },
    data: {
      telegramChatId: String(chatId),
      telegramVerified: false,
      telegramConnectState: null,
      ...(telegramUsername ? { telegramId: telegramUsername } : {}),
    },
  });

  await sendMessage(chatId,
    `✅ <b>Request sent successfully!</b>\n\n` +
    `📧 Account: <code>${esc(email)}</code>\n\n` +
    `Now open <b>IIUC-ARMS web app → Dashboard → Connections → Telegram</b>,\n` +
    `click <b>Send OTP</b>, then enter the 6-digit OTP from this chat to verify.`,
    { parse_mode: 'HTML' }
  );
  console.log(`[TG] /connect: ${email} -> chat_id ${chatId} (pending verification)`);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[TG] Webhook received:', JSON.stringify(body).substring(0, 200));

    if (body.callback_query) {
      await handleCallbackQuery(body.callback_query);
      return NextResponse.json({ ok: true });
    }

    if (body.message) {
      await handleMessage(body.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[TG] Webhook error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── Helper: connect via shared phone number (for users without username) ──
async function handleSharedContact(chatId: number, phoneNumber: string, telegramUsername: string | null) {
  const { prisma } = await import('@/lib/prisma');
  const digits = (phoneNumber || '').replace(/\D/g, '');
  const last8 = digits.slice(-8);

  if (!last8) {
    await sendMessage(chatId,
      `❌ Could not read your phone number.\n\n` +
      `Please use <code>/connect yourmail@ugrad.iiuc.ac.bd</code> instead.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const profiles = await prisma.profile.findMany({
    where: { phone: { not: null } },
    select: { userId: true, phone: true, name: true, telegramChatId: true, telegramVerified: true },
  });

  const matches = profiles.filter(p => (p.phone || '').replace(/\D/g, '').slice(-8) === last8);

  if (matches.length === 0) {
    await sendMessage(chatId,
      `❌ <b>No account found</b>\n\n` +
      `No IIUC-ARMS account is registered with phone number <code>${esc(phoneNumber)}</code>.\n\n` +
      `Make sure your phone number is saved in your profile (Dashboard → Profile), or use\n` +
      `<code>/connect yourmail@ugrad.iiuc.ac.bd</code>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  for (const profile of matches.slice(0, 3)) {
    await prisma.profile.update({
      where: { userId: profile.userId },
      data: {
        telegramChatId: String(chatId),
        telegramVerified: false,
        telegramConnectState: null,
        telegramOtp: null,
        telegramOtpExpiresAt: null,
        // Take both when available: username (if set) + shared phone number
        ...(telegramUsername ? { telegramId: telegramUsername } : {}),
        ...(profile.phone ? {} : { phone: phoneNumber }),
      },
    });
  }

  await sendMessage(chatId,
    `✅ <b>Phone number linked!</b>\n\n` +
    `📱 ${esc(phoneNumber)}` +
    (telegramUsername ? `\n👤 Username: ${esc(telegramUsername)}` : '') +
    `\n👤 ${matches.map(m => m.name).filter(Boolean).join(', ') || matches[0].userId}\n\n` +
    `Now open <b>IIUC-ARMS web app → Dashboard → Connections → Telegram</b>,\n` +
    `click <b>Send OTP</b>, then enter the 6-digit OTP from this chat to verify.`,
    { parse_mode: 'HTML' }
  );
  console.log(`[TG] Phone ${phoneNumber} -> chat_id ${chatId} (linked ${matches.length} account(s), pending verification)`);
}

const CONTACT_KEYBOARD = {
  keyboard: [[{ text: '📱 Connect by Phone Number', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

async function handleMessage(msg: any) {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const chatType = msg.chat.type;
  const isGroup = chatType === 'group' || chatType === 'supergroup';

  console.log(`[TG] msg from ${chatId}: "${text}" | TOKEN=${process.env.TELEGRAM_BOT_TOKEN ? 'SET(' + process.env.TELEGRAM_BOT_TOKEN.substring(0, 5) + '...)' : 'MISSING'}`);

  await sendChatAction(chatId);

  // ─── Shared contact (phone number connect) ───
  if (msg.contact && msg.contact.phone_number) {
    const telegramUsername = msg.from?.username ? `@${msg.from.username}` : null;
    await handleSharedContact(chatId, msg.contact.phone_number, telegramUsername);
    return;
  }

  if (isGroup) {
    const isCommand = msg.entities?.some((e: any) => e.type === 'bot_command' && e.offset === 0);
    const isMention = msg.entities?.some((e: any) => e.type === 'mention' && e.offset === 0);
    if (!isCommand && !isMention && !COURSE_REGEX.test(text)) return;
  }

  const cleanText = text
    .replace(/(\/\w+)@[A-Za-z]\w*/g, '$1')
    .replace(/^@[A-Za-z]\w*\s+/, '')
    .trim();
  const telegramUsername = msg.from?.username ? `@${msg.from.username}` : null;

  try {
    // ─── /start ───
    if (cleanText === '/start') {
      try {
        const username = msg.from?.username;
        const { prisma } = await import('@/lib/prisma');

        if (username) {
          const profile = await prisma.profile.findFirst({
            where: { telegramId: { in: [`@${username}`, username] } },
          });
          if (profile && !profile.telegramChatId) {
            await prisma.profile.update({
              where: { userId: profile.userId },
              data: { telegramChatId: String(chatId) },
            });
            console.log(`[TG] Linked @${username} -> chat_id ${chatId} (user: ${profile.userId})`);
          } else if (profile) {
            if (profile.telegramChatId !== String(chatId)) {
              await prisma.profile.update({
                where: { userId: profile.userId },
                data: { telegramChatId: String(chatId) },
              });
            }
          }
        }
      } catch (err: any) {
        console.error('[TG] Failed to link chat_id:', err?.message);
      }

      await sendMessage(chatId, buildWelcomeMessage(), {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Open IIUC-ARMS', url: SITE_URL }],
            [
              { text: '🏫 Faculties', callback_data: 'start_faculties' },
              { text: '👥 Contributors', callback_data: 'start_contributors' },
            ],
            [
              { text: '💻 Developed By', callback_data: 'start_devby' },
              { text: '📖 Help', callback_data: 'start_help' },
            ],
          ],
          ...CONTACT_KEYBOARD,
        },
      });
      return;
    }

    // ─── /start <email> (deep link from web app) ───
    if (cleanText.startsWith('/start ')) {
      const payload = cleanText.replace('/start', '').trim();
      if (payload && payload.includes('@')) {
        try {
          const { prisma } = await import('@/lib/prisma');
          const profile = await prisma.profile.findUnique({ where: { userId: payload }, select: { userId: true, telegramChatId: true, telegramVerified: true } });
          if (profile && !(profile.telegramChatId && profile.telegramVerified)) {
            const otp = String(Math.floor(100000 + Math.random() * 900000));
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
            await prisma.profile.update({
              where: { userId: payload },
              data: {
                telegramChatId: String(chatId),
                telegramVerified: false,
                telegramOtp: otp,
                telegramOtpExpiresAt: expiresAt,
                telegramConnectState: null,
                ...(telegramUsername ? { telegramId: telegramUsername } : {}),
              },
            });
            await sendMessage(chatId, `🔗 <b>Telegram connection requested!</b>\n\nNow open IIUC-ARMS web app and confirm your Telegram account.`, { parse_mode: 'HTML' });
            console.log(`[TG] Deep link: ${payload} -> chat_id ${chatId} (pending verification)`);
            return;
          }
          if (profile?.telegramChatId && profile.telegramVerified) {
            await sendMessage(chatId, `ℹ️ This account is already connected to Telegram.`, { parse_mode: 'HTML' });
            return;
          }
        } catch (err: any) {
          console.error('[TG] Deep link error:', err?.message);
        }
        await sendMessage(chatId, `⚠️ Could not link account <code>${payload}</code>. Please try again or contact admin.`, { parse_mode: 'HTML' });
        return;
      }
    }

    // ─── /connect — link Telegram account ───
    if (cleanText === '/connect' || cleanText.startsWith('/connect ')) {
      const email = cleanText.replace('/connect', '').trim().toLowerCase();
      if (!email || !email.includes('@')) {
        await sendMessage(chatId,
          `🔗 <b>Connect your Telegram</b>\n\n` +
          `Option 1 (recommended): <code>/connect yourmail@ugrad.iiuc.ac.bd</code>\n\n` +
          `Option 2: Tap <b>📱 Connect by Phone Number</b> below to link with the number saved in your profile.\n\n` +
          `Then open the web app → Dashboard → Connections → Telegram → Send OTP.`,
          { parse_mode: 'HTML', ...CONTACT_KEYBOARD }
        );
        return;
      }
      await sendMessage(chatId,
        `⏳ <b>Processing...</b>\n\n` +
        `Checking account <code>${esc(email)}</code> and linking this Telegram chat...`,
        { parse_mode: 'HTML' }
      );
      await processConnectEmail(chatId, email, telegramUsername);
      return;
    }

    // ─── /disconnect — unlink Telegram ───
    if (cleanText === '/disconnect') {
      try {
        const { prisma } = await import('@/lib/prisma');
        const profile = await prisma.profile.findFirst({ where: { telegramChatId: String(chatId) } });
        if (!profile) {
          await sendMessage(chatId, 'ℹ️ No connected account found.', { parse_mode: 'HTML' });
          return;
        }
        await prisma.profile.update({
          where: { userId: profile.userId },
          data: { telegramChatId: null, telegramVerified: false, telegramOtp: null, telegramOtpExpiresAt: null, telegramConnectState: null },
        });
        await sendMessage(chatId, `✅ <b>Telegram disconnected</b>\n\nYour account (<code>${profile.userId}</code>) has been unlinked from this Telegram chat.`, { parse_mode: 'HTML' });
        console.log(`[TG] /disconnect: ${profile.userId} <- chat_id ${chatId}`);
      } catch (err: any) {
        console.error('[TG] /disconnect error:', err?.message);
        await sendMessage(chatId, '❌ Something went wrong. Please try again later.', { parse_mode: 'HTML' });
      }
      return;
    }

    // ─── /status — show connection status ───
    if (cleanText === '/status') {
      try {
        const { prisma } = await import('@/lib/prisma');
        const profile = await prisma.profile.findFirst({ where: { telegramChatId: String(chatId) }, select: { userId: true, name: true, telegramVerified: true, telegramConnectState: true } });
        if (!profile) {
          await sendMessage(chatId, 'ℹ️ You are not connected to any IIUC-ARMS account.\n\nSend <code>/connect</code> to link.', { parse_mode: 'HTML' });
          return;
        }
        if (profile.telegramVerified) {
          await sendMessage(chatId, `✅ <b>Connected</b>\n\n📧 Account: <code>${profile.userId}</code>\n👤 Name: ${profile.name || 'Not set'}\n\nYou will receive notifications for this account.`, { parse_mode: 'HTML' });
        } else if (profile.telegramConnectState === 'awaiting_email') {
          await sendMessage(chatId, `📧 <b>Awaiting your email</b>\n\n📧 Account: <code>${profile.userId}</code>\n\nSend your IIUC-ARMS login email to continue, or <code>/cancel</code> to abort.`, { parse_mode: 'HTML' });
        } else {
          await sendMessage(chatId, `⏳ <b>Pending verification</b>\n\n📧 Account: <code>${profile.userId}</code>\n\nOpen the IIUC-ARMS web app to complete verification.`, { parse_mode: 'HTML' });
        }
      } catch (err: any) {
        console.error('[TG] /status error:', err?.message);
        await sendMessage(chatId, '❌ Something went wrong.', { parse_mode: 'HTML' });
      }
      return;
    }

    // ─── /help ───
    if (cleanText === '/help') {
      await sendMessage(chatId, buildHelpMessage());
      return;
    }

    // ─── /departments ───
    if (cleanText === '/departments') {
      await sendMessage(chatId, buildDeptList(), {
        reply_markup: { inline_keyboard: [[{ text: '🌐 Open IIUC-ARMS', url: openLink(SITE_URL) }] ]},
      });
      return;
    }

    // ─── /semester N ───
    if (cleanText.startsWith('/semester')) {
      const semNum = cleanText.replace('/semester', '').trim();
      if (!semNum || !/^[1-8]$/.test(semNum)) {
        await sendMessage(chatId, `Usage: <code>/semester 3</code>\nSemester number must be 1-8.`);
        return;
      }
      const num = parseInt(semNum);
      const semId = `${num}${num === 1 ? 'st' : num === 2 ? 'nd' : num === 3 ? 'rd' : 'th'}-semister`;
      const tree = await getGithubTree();
      if (!tree.length) {
        await sendMessage(chatId, `⚠️ Could not load course data. Try again later.`);
        return;
      }
      await sendMessage(chatId, buildCoursesList(tree, undefined, semId), {
        reply_markup: { inline_keyboard: [[{ text: '🌐 Open IIUC-ARMS', url: openLink(SITE_URL) }] ]},
      });
      return;
    }

    // ─── /course-code CODE or /code CODE ───
    if (cleanText.startsWith('/course-code') || cleanText.startsWith('/code')) {
      const code = cleanText.replace(/^(\/course-code|\/code)\s*/i, '').trim().toUpperCase();
      if (!code || !/^[A-Z]{2,5}-?\d{3,5}[A-Z]?$/i.test(code)) {
        await sendMessage(chatId,
          `Usage: <code>/course-code QSM-3602</code>\n\n` +
          `Course code format: 2-5 letters + 3-5 digits\n` +
          `Examples: QUR101, QSM-3602, CSE101`
        );
        return;
      }
      const tree = await getGithubTree();
      if (!tree.length) {
        await sendMessage(chatId, `⚠️ Could not load course data. Try again later.`);
        return;
      }
      const files = findCourseFiles(tree, code);
      const info = getCourseInfo(files);

      if (!info) {
        const locations = findCourseLocations(tree, code);
        if (locations.length === 0) {
          await sendMessage(chatId,
            `❌ No course found for <b>${esc(code)}</b>.\n\n` +
            `💡 Try:\n` +
            `• Check the course code spelling\n` +
            `• <code>/departments</code> to browse\n` +
            `• <code>/search ${code}</code> to search`
          );
          return;
        }
        const courseTitle = locations[0].title || code;
        let msg = `<b>📚 ${esc(code)}</b> — ${esc(courseTitle)}\n`;
        msg += `📂 Course exists but no files uploaded yet.\n\n`;
        const buttons: any[][] = [];
        for (const loc of locations) {
          const semLabel = config.semesters.find(s => s.id === loc.sem)?.label || loc.sem;
          msg += `📍 <b>${esc(semLabel)}</b> — ${esc(getDeptName(loc.dept))}\n`;
          const directUrl = `${SITE_URL}/?dept=${loc.dept}&sem=${loc.sem}&course=${code}`;
          buttons.push([{ text: `📂 Open ${code} — ${getDeptName(loc.dept)} ${semLabel}`, url: directUrl }]);
        }
        await sendMessage(chatId, msg, { reply_markup: { inline_keyboard: buttons } });
        return;
      }

      const depts = Array.from(new Set(files.map(f => f.department)));

      let msg = `<b>📚 ${esc(code)}</b>\n\n`;

      const buttons: any[][] = [];

      for (const dept of depts) {
        const deptSems = Array.from(new Set(files.filter(f => f.department === dept).map(f => f.semester)));
        for (const sem of deptSems) {
          const semFiles = files.filter(f => f.department === dept && f.semester === sem);
          const semLabel = config.semesters.find(s => s.id === sem)?.label || sem;
          const catCounts: Record<string, number> = {};
          for (const f of semFiles) {
            catCounts[f.category] = (catCounts[f.category] || 0) + 1;
          }
          const catParts = Object.entries(catCounts).map(([k, v]) => {
            const meta = CATEGORY_META[k];
            return `${meta?.icon || '📁'} ${meta?.label || k}: ${v}`;
          }).join(' · ');
          msg += `📍 <b>${esc(semLabel)}</b> — ${esc(getDeptName(dept))}\n`;
          msg += `  ${catParts}\n`;
          const directUrl = `${SITE_URL}/?dept=${dept}&sem=${sem}&course=${code}`;
          buttons.push([{ text: `📂 Open ${code} — ${getDeptName(dept)} ${semLabel}`, url: directUrl }]);
        }
      }

      await sendMessage(chatId, msg, {
        reply_markup: { inline_keyboard: buttons },
      });
      return;
    }

    // ─── /courses [dept] [sem] ───
    if (cleanText.startsWith('/courses')) {
      const args = cleanText.replace('/courses', '').trim().split(/\s+/);
      const deptId = args[0] || '';
      const semNum = args[1] || '';

      let semId = '';
      if (semNum && /^[1-8]$/.test(semNum)) {
        const num = parseInt(semNum);
        semId = `${num}${num === 1 ? 'st' : num === 2 ? 'nd' : num === 3 ? 'rd' : 'th'}-semister`;
      }

      const tree = await getGithubTree();
      if (!tree.length) {
        await sendMessage(chatId, `⚠️ Could not load course data. Try again later.`);
        return;
      }
      await sendMessage(chatId, buildCoursesList(tree, deptId || undefined, semId || undefined));
      return;
    }

    // ─── /search query ───
    if (cleanText.startsWith('/search')) {
      const query = cleanText.replace('/search', '').trim();
      if (!query) {
        await sendMessage(chatId,
          `Usage: <code>/search notes</code>\n\n` +
          `Search for files, courses, or folders by name.`
        );
        return;
      }
      const tree = await getGithubTree();
      if (!tree.length) {
        await sendMessage(chatId, `⚠️ Could not load course data. Try again later.`);
        return;
      }
      await sendMessage(chatId, buildSearchResults(query, tree));
      return;
    }

    // ─── /stats ───
    if (cleanText === '/stats') {
      const tree = await getGithubTree();
      if (!tree.length) {
        await sendMessage(chatId, `⚠️ Could not load course data. Try again later.`);
        return;
      }
      await sendMessage(chatId, buildStatsMessage(tree));
      return;
    }

    // ─── /broadcast (owner only) ───
    if (cleanText.startsWith('/broadcast')) {
      const broadcastMsg = cleanText.replace('/broadcast', '').trim();
      if (!broadcastMsg) {
        await sendMessage(chatId, `Usage: <code>/broadcast Your announcement message</code>\n\nOnly the owner can use this command.`);
        return;
      }
      await sendMessage(chatId,
        `📢 <b>Broadcast Preview</b>\n\n` +
        `${broadcastMsg}\n\n` +
        `Use the admin panel to send this to all users.`,
      );
      return;
    }

    // ─── Plain course code (e.g. QSM-3602, QUR101) ───
    if (COURSE_REGEX.test(cleanText)) {
      const courseCode = cleanText.toUpperCase();

      const tree = await getGithubTree();
      if (!tree.length) {
        await sendMessage(chatId, `⚠️ Could not load course data. Try again later.`);
        return;
      }
      const files = findCourseFiles(tree, courseCode);
      const info = getCourseInfo(files);

      if (!info) {
        const locations = findCourseLocations(tree, courseCode);
        if (locations.length === 0) {
          await sendMessage(chatId,
            `❌ No course found for <b>${esc(courseCode)}</b>.\n\n` +
            `💡 Try:\n` +
            `• Check the course code spelling\n` +
            `• <code>/departments</code> to browse\n` +
            `• <code>/search ${courseCode}</code> to search`
          );
          return;
        }
        const courseTitle = locations[0].title || courseCode;
        let msg = `<b>📚 ${esc(courseCode)}</b> — ${esc(courseTitle)}\n`;
        msg += `📂 Course exists but no files uploaded yet.\n\n`;
        const buttons: any[][] = [];
        for (const loc of locations) {
          const semLabel = config.semesters.find(s => s.id === loc.sem)?.label || loc.sem;
          msg += `📍 <b>${esc(semLabel)}</b> — ${esc(getDeptName(loc.dept))}\n`;
          const directUrl = `${SITE_URL}/?dept=${loc.dept}&sem=${loc.sem}&course=${courseCode}`;
          buttons.push([{ text: `📂 Open ${courseCode} — ${getDeptName(loc.dept)} ${semLabel}`, url: directUrl }]);
        }
        await sendMessage(chatId, msg, { reply_markup: { inline_keyboard: buttons } });
        return;
      }

      const depts = Array.from(new Set(files.map(f => f.department)));

      let msg = `<b>📚 ${esc(courseCode)}</b>\n\n`;

      const buttons: any[][] = [];

      for (const dept of depts) {
        const deptSems = Array.from(new Set(files.filter(f => f.department === dept).map(f => f.semester)));
        for (const sem of deptSems) {
          const semFiles = files.filter(f => f.department === dept && f.semester === sem);
          const semLabel = config.semesters.find(s => s.id === sem)?.label || sem;
          const catCounts: Record<string, number> = {};
          for (const f of semFiles) {
            catCounts[f.category] = (catCounts[f.category] || 0) + 1;
          }
          const catParts = Object.entries(catCounts).map(([k, v]) => {
            const meta = CATEGORY_META[k];
            return `${meta?.icon || '📁'} ${meta?.label || k}: ${v}`;
          }).join(' · ');
          msg += `📍 <b>${esc(semLabel)}</b> — ${esc(getDeptName(dept))}\n`;
          if (catParts) msg += `  ${catParts}\n`;
          const directUrl = `${SITE_URL}/?dept=${dept}&sem=${sem}&course=${courseCode}`;
          buttons.push([{ text: `📂 Open ${courseCode} — ${getDeptName(dept)} ${semLabel}`, url: directUrl }]);
        }
      }

      await sendMessage(chatId, msg, {
        reply_markup: { inline_keyboard: buttons },
      });
      return;
    }

    // ─── Unknown command ───
    if (cleanText.startsWith('/')) {
      await sendMessage(chatId,
        `🤔 Unknown command.\n\n` +
        `Try:\n` +
        `• <code>/connect</code> — Link your Telegram\n` +
        `• <code>QUR101</code> — search a course\n` +
        `• <code>/search notes</code> — search files\n` +
        `• <code>/departments</code> — list departments\n` +
        `• <code>/help</code> — all commands`
      );
      return;
    }

    // ─── Plain text in private chat ───
    if (!isGroup) {
      await sendMessage(chatId,
        `🤔 Send a course code like <code>QSM-3602</code> to search.\n\n` +
        `Or try:\n` +
        `• <code>/connect</code> — Link your Telegram\n` +
        `• <code>/search notes</code>\n` +
        `• <code>/departments</code>\n` +
        `• <code>/help</code>`
      );
    }
  } catch (err: any) {
    console.error(`Telegram command error [${cleanText}]:`, err);
    await sendMessage(chatId,
      `⚠️ Something went wrong processing your request.\n` +
      `Error: ${esc(err?.message || 'Unknown error')}\n\n` +
      `Try again or use <code>/help</code> for commands.`
    );
  }
}

async function handleCallbackQuery(cq: any) {
  const data: string = cq.data || '';
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;

  await answerCallbackQuery(cq.id);

  if (!chatId || !messageId) return;

  const parsed = parseCallbackData(data);
  if (!parsed) return;

  try {
    // ─── Start menu buttons ───
    if (parsed.type === 'start_faculties') {
      await editMessageText(chatId, messageId, buildDeptList(), {
        reply_markup: { inline_keyboard: [[{ text: '🌐 Open IIUC-ARMS', url: SITE_URL }]] },
      });
      return;
    }
    if (parsed.type === 'start_contributors') {
      await editMessageText(chatId, messageId,
        `👥 <b>Contributors</b>\n\n` +
        `All course files are uploaded and maintained by our contributors.\n` +
        `Visit the Contributors page to see who contributed.\n\n` +
        `<a href="${SITE_URL}/contributors">Open Contributors Page →</a>`,
        { reply_markup: { inline_keyboard: [[{ text: '👥 Open Contributors', url: SITE_URL + '/contributors' }]] } }
      );
      return;
    }
    if (parsed.type === 'start_devby') {
      await editMessageText(chatId, messageId,
        `💻 <b>Developed By</b>\n\n` +
        `<b>Sayed Atiqur Rahman</b>\n` +
        `🎓 IIUC • Programming Light\n\n` +
        `🌐 <a href="${SITE_URL}">Open IIUC-ARMS →</a>`,
        { reply_markup: { inline_keyboard: [[{ text: '🌐 Open IIUC-ARMS', url: SITE_URL }]] } }
      );
      return;
    }
    if (parsed.type === 'start_help') {
      await editMessageText(chatId, messageId, buildHelpMessage());
      return;
    }

    // ─── Category buttons ───
    if (parsed.type === 'cat') {
      const [courseCode, category] = parsed.args;
      if (!courseCode || !category) return;

      const tree = await getGithubTree();
      const files = findCourseFiles(tree, courseCode);
      const text = buildCategoryResult(courseCode, category, files);

      const info = getCourseInfo(files);
      const buttons = (info?.categories || []).map(cat => {
        const meta = CATEGORY_META[cat];
        return {
          text: `${cat === category ? '✅ ' : ''}${meta?.icon || '📁'} ${meta?.label || cat}`,
          callback_data: catCallbackData(courseCode, cat),
        };
      });

      const websiteLink = buildCourseLink(courseCode);

      await editMessageText(chatId, messageId, text, {
        reply_markup: {
          inline_keyboard: [
            buttons,
            [{ text: '🌐 Open on IIUC-ARMS', url: websiteLink }],
          ],
        },
      });
    }

    // ─── Course delete request confirm (pending owner deletes) ───
    if (parsed.type === 'course_del_confirm') {
      const activityId = parsed.args[0];
      if (!activityId) return;

      const { prisma } = await import('@/lib/prisma');
      let logEntry: any = null;
      try {
        logEntry = await prisma.activityLog.findUnique({ where: { id: activityId } });
      } catch {}

      if (!logEntry || logEntry.action !== 'course_delete_request') {
        await editMessageText(chatId, messageId, `❌ Delete request not found or already processed.`);
        return;
      }

      const details = JSON.parse(logEntry.details || '{}');
      if (details.status !== 'pending_approval') {
        await editMessageText(chatId, messageId, `❌ This delete request was already ${details.status || 'processed'}.`);
        return;
      }

      const folderPath: string = details.folderPath || '';
      if (!folderPath) {
        await editMessageText(chatId, messageId, `❌ Invalid delete request — no folder path found.`);
        return;
      }

      const githubDeleted = await deleteCourseFolder(folderPath).catch(() => 0);

      let course: any = null;
      try {
        course = await prisma.course.findFirst({
          where: { code: String(details.code || '').toUpperCase(), semester: details.semester, department: details.department },
        });
      } catch {}
      if (course) {
        try { await prisma.course.delete({ where: { id: course.id } }); } catch {}
      }

      // Mark approved (also syncs the panel, which reads status from details)
      try {
        const parsedDetails = JSON.parse(logEntry.details || '{}');
        parsedDetails.status = 'approved';
        parsedDetails.approvedBy = `chat:${chatId}`;
        parsedDetails.resolvedAt = new Date().toISOString();
        await prisma.activityLog.update({
          where: { id: activityId },
          data: { action: 'course_delete_approved', details: JSON.stringify(parsedDetails) },
        });
      } catch {}

      // Notify the requester if connected
      const requesterChatId = await resolveRequesterChat(logEntry.userId);
      if (requesterChatId) {
        try {
          await sendMessage(requesterChatId,
            `✅ <b>Delete approved</b>\n\n` +
            `<b>Course:</b> <code>${details.code || ''}</code> — ${details.title || ''}\n` +
            `<b>Path:</b> <code>${folderPath}</code>\n\n` +
            `Your delete request has been <b>approved</b> by an admin.`
          );
        } catch {}
      }

      const semLabel = details.semester ? (config.semesters.find(s => s.id === details.semester)?.label || details.semester) : '';
      const pageLink = buildCourseLink(details.code || '', details.department, details.semester);
      await editMessageText(chatId, messageId, [
        `✅ <b>Course Deleted</b>`, ``,
        `<b>Code:</b> <code>${details.code || ''}</code>`,
        `<b>Title:</b> ${details.title || ''}`,
        `<b>Semester:</b> ${semLabel}`,
        `<b>Path:</b> <code>${folderPath}</code>`,
        `<b>GitHub files removed:</b> ${githubDeleted}`, ``,
        `<i>Approved by admin</i>`,
      ].join('\n'), {
        reply_markup: { inline_keyboard: pageLink ? [[{ text: `📂 Open course in web app`, url: pageLink }]] : [] },
      });
    }

    // ─── Course delete request reject ───
    if (parsed.type === 'course_del_reject') {
      const activityId = parsed.args[0];
      if (!activityId) return;

      const { prisma } = await import('@/lib/prisma');
      let logEntry: any = null;
      try {
        logEntry = await prisma.activityLog.findUnique({ where: { id: activityId } });
      } catch {}

      if (!logEntry || logEntry.action !== 'course_delete_request') {
        await editMessageText(chatId, messageId, `❌ Delete request not found or already processed.`);
        return;
      }

      const details = JSON.parse(logEntry.details || '{}');
      if (details.status !== 'pending_approval') {
        await editMessageText(chatId, messageId, `❌ This delete request was already ${details.status || 'processed'}.`);
        return;
      }

      try {
        const parsedDetails = JSON.parse(logEntry.details || '{}');
        parsedDetails.status = 'rejected';
        parsedDetails.approvedBy = `chat:${chatId}`;
        parsedDetails.resolvedAt = new Date().toISOString();
        await prisma.activityLog.update({
          where: { id: activityId },
          data: { action: 'course_delete_rejected', details: JSON.stringify(parsedDetails) },
        });
      } catch {}

      const requesterChatId = await resolveRequesterChat(logEntry.userId);
      if (requesterChatId) {
        try {
          await sendMessage(requesterChatId,
            `❌ <b>Delete rejected</b>\n\n` +
            `<b>Course:</b> <code>${details.code || ''}</code> — ${details.title || ''}\n` +
            `Your delete request was <b>rejected</b> by an admin.`
          );
        } catch {}
      }

      await editMessageText(chatId, messageId, [
        `❌ <b>Delete Rejected</b>`, ``,
        `<b>Code:</b> <code>${details.code || ''}</code>`,
        `<b>Title:</b> ${details.title || ''}`, ``,
        `<i>Rejected by admin</i>`,
      ].join('\n'));
    }

    // ─── Delete confirm ───
    if (parsed.type === 'del_confirm') {
      const courseKey = parsed.args[0];
      if (!courseKey) return;

      const [dept, sem, code] = courseKey.split('/');
      if (!dept || !sem || !code) return;

      const { prisma } = await import('@/lib/prisma');

      let course: any = null;
      try {
        course = await prisma.course.findFirst({ where: { code: code.toUpperCase(), semester: sem, department: dept } });
      } catch {}

      const courseTitle = course?.title || code.toUpperCase();
      const courseDept = course?.department || dept;
      const courseSem = course?.semester || sem;
      const courseCode = course?.code || code.toUpperCase();

      const cleanTitle = courseTitle.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
      const folderPath = `${config.uploadPath}/${getDepartmentFolder(courseDept)}/${courseSem}/${courseCode} - ${cleanTitle}`;

      let githubDeleted = 0;
      try {
        const botToken = await getAppBotToken();
        if (botToken) {
          const allFiles = await getAllFilesInFolder(botToken, folderPath);
          githubDeleted = await batchDeleteFiles(botToken, allFiles);
        }
      } catch {}

      if (course) {
        try { await prisma.course.delete({ where: { id: course.id } }); } catch {}
      }

      const semLabel = config.semesters.find(s => s.id === courseSem)?.label || courseSem;
      const pageLink = buildBrowseLink({ dept: courseDept, sem: courseSem });
      await editMessageText(chatId, messageId, [
        `✅ <b>Course Deleted</b>`, ``,
        `<b>Code:</b> <code>${courseCode}</code>`,
        `<b>Title:</b> ${courseTitle}`,
        `<b>Folder:</b> <code>${folderPath}</code>`,
        `<b>GitHub files removed:</b> ${githubDeleted}`, ``,
        `<i>Approved by admin</i>`,
      ].join('\n'), {
        reply_markup: { inline_keyboard: [[{ text: `📂 View in ${semLabel}`, url: pageLink }]] },
      });
    }

    // ─── Delete reject ───
    if (parsed.type === 'del_reject') {
      const courseKey = parsed.args[0];
      if (!courseKey) return;

      const [dept, sem, code] = courseKey.split('/');
      const semLabel = sem ? (config.semesters.find(s => s.id === sem)?.label || sem) : '';
      const pageLink = dept && sem ? buildBrowseLink({ dept, sem }) : '';

      await editMessageText(chatId, messageId, [
        `❌ <b>Delete Rejected</b>`, ``,
        code ? `<b>Code:</b> <code>${code}</code>` : '',
        semLabel ? `<b>Semester:</b> ${semLabel}` : '', ``,
        `<i>Rejected by admin</i>`,
      ].join('\n'), {
        reply_markup: { inline_keyboard: pageLink ? [[{ text: `📂 View in ${semLabel}`, url: pageLink }]] : [] },
      });
    }

    // ─── File Delete confirm ───
    if (parsed.type === 'del_file_confirm') {
      const activityId = parsed.args[0];
      if (!activityId) return;

      const { prisma } = await import('@/lib/prisma');
      let logEntry: any = null;
      try {
        logEntry = await prisma.activityLog.findUnique({ where: { id: activityId } });
      } catch {}

      if (!logEntry || logEntry.action !== 'file_delete_request') {
        await editMessageText(chatId, messageId, `❌ Delete request not found or already processed.`);
        return;
      }

      const details = JSON.parse(logEntry.details || '{}');
      const filePath: string = details.path || '';
      if (!filePath) {
        await editMessageText(chatId, messageId, `❌ Invalid delete request — no file path found.`);
        return;
      }

      const fromFull = `${config.uploadPath}/${filePath}`;
      let githubDeleted = 0;

      try {
        const botToken = await getAppBotToken();
        if (botToken) {
          const refRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, { headers: ghHeaders(botToken) });
          if (refRes.ok) {
            const refData = await refRes.json();
            const baseCommitSha = refData.object.sha;
            const commitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits/${baseCommitSha}`, { headers: ghHeaders(botToken) });
            if (commitRes.ok) {
              const commitData = await commitRes.json();
              const baseTreeSha = commitData.tree.sha;
              const fullTreeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees/${baseTreeSha}?recursive=1`, { headers: ghHeaders(botToken) });
              if (fullTreeRes.ok) {
                const fullTreeData = await fullTreeRes.json();
                const deletePaths = new Set((fullTreeData.tree || []).filter((item: any) => item.path.startsWith(fromFull + '/') || item.path === fromFull).map((item: any) => item.path));
                const keepItems = (fullTreeData.tree || []).filter((item: any) => !deletePaths.has(item.path));
                if (keepItems.length > 0 && deletePaths.size > 0) {
                  const treeItems = keepItems.map((item: any) => ({
                    path: item.path, mode: item.mode, type: item.type,
                    sha: item.type === 'blob' ? item.sha : undefined,
                  }));
                  const treeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees`, {
                    method: 'POST', headers: ghHeaders(botToken),
                    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
                  });
                  if (treeRes.ok) {
                    const treeData = await treeRes.json();
                    const newCommitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits`, {
                      method: 'POST', headers: ghHeaders(botToken),
                      body: JSON.stringify({ message: `Delete: ${filePath}`, tree: treeData.sha, parents: [baseCommitSha] }),
                    });
                    if (newCommitRes.ok) {
                      const newCommitData = await newCommitRes.json();
                      await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, {
                        method: 'PATCH', headers: ghHeaders(botToken),
                        body: JSON.stringify({ sha: newCommitData.sha, force: true }),
                      });
                      githubDeleted = deletePaths.size;
                    }
                  }
                }
              }
            }
          }
        }
      } catch {}

      // Update activity log
      try {
        const parsedDetails = JSON.parse(logEntry.details || '{}');
        parsedDetails.status = 'approved';
        parsedDetails.approvedBy = `chat:${chatId}`;
        await prisma.activityLog.update({
          where: { id: activityId },
          data: { details: JSON.stringify(parsedDetails), action: 'file_delete_approved' },
        });
      } catch {}

      const parentParts = filePath.split('/');
      const browseLink = parentParts.length >= 2 ? buildBrowseLink({ dept: parentParts[0], sem: parentParts[1] }) : '';

      await editMessageText(chatId, messageId, [
        `✅ <b>File Deleted</b>`, ``,
        `<b>Path:</b> <code>${filePath}</code>`,
        `<b>Files removed:</b> ${githubDeleted}`, ``,
        `<i>Approved by admin</i>`,
      ].join('\n'), {
        reply_markup: { inline_keyboard: [[{ text: '📂 Visit Directory', url: browseLink }]] },
      });
    }

    // ─── File Delete reject ───
    if (parsed.type === 'del_file_reject') {
      const activityId = parsed.args[0];
      if (!activityId) return;

      const { prisma } = await import('@/lib/prisma');
      let logEntry: any = null;
      try {
        logEntry = await prisma.activityLog.findUnique({ where: { id: activityId } });
      } catch {}

      const filePath = logEntry ? JSON.parse(logEntry.details || '{}').path : '';

      // Update activity log
      if (logEntry) {
        try {
          const parsedDetails = JSON.parse(logEntry.details || '{}');
          parsedDetails.status = 'rejected';
          parsedDetails.rejectedBy = `chat:${chatId}`;
          await prisma.activityLog.update({
            where: { id: activityId },
            data: { details: JSON.stringify(parsedDetails), action: 'file_delete_rejected' },
          });
        } catch {}
      }

      const parentParts = (filePath || '').split('/');
      const browseLink = parentParts.length >= 2 ? buildBrowseLink({ dept: parentParts[0], sem: parentParts[1] }) : '';

      await editMessageText(chatId, messageId, [
        `❌ <b>Delete Rejected</b>`, ``,
        filePath ? `<b>Path:</b> <code>${filePath}</code>` : '', ``,
        `<i>Rejected by admin</i>`,
      ].join('\n'), {
        reply_markup: { inline_keyboard: browseLink ? [[{ text: '📂 Visit Directory', url: browseLink }]] : [] },
      });
    }

    // ─── Broadcast confirm/cancel ───
    if (parsed.type === 'broadcast') {
      const action = parsed.args[0];
      if (action === 'cancel') {
        await editMessageText(chatId, messageId, `❌ Broadcast cancelled.`);
        return;
      }
      if (action === 'confirm') {
        const isOwner = config.ownerEmails.includes(String(chatId));
        if (!isOwner) {
          await editMessageText(chatId, messageId, `❌ Only the owner can broadcast.`);
          return;
        }
        const rawCallback = data.replace('broadcast:confirm:', '');
        let broadcastMsg = '';
        try {
          broadcastMsg = Buffer.from(rawCallback, 'base64').toString('utf-8');
        } catch {
          await editMessageText(chatId, messageId, `❌ Could not decode broadcast message.`);
          return;
        }
        if (!broadcastMsg) {
          await editMessageText(chatId, messageId, `❌ Empty broadcast message.`);
          return;
        }
        await editMessageText(chatId, messageId, `⏳ Broadcasting...`);
        await sendMessage(chatId, `📢 Broadcast ready. Use the admin panel to send.`);
      }
    }
  } catch (err: any) {
    console.error('Callback query error:', err);
    await sendMessage(chatId, `⚠️ Error processing action: ${err?.message || 'Unknown'}`);
  }
}
