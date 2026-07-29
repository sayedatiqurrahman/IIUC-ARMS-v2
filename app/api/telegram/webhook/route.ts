import { NextRequest, NextResponse } from 'next/server';
import {
  sendMessage,
  answerCallbackQuery,
  editMessageText,
  deleteMessage,
  getGithubTree,
  findCourseFiles,
  getCourseInfo,
  buildWelcomeMessage,
  buildHelpMessage,
  buildCourseResult,
  buildCategoryResult,
  buildDeptList,
  buildSemesterList,
  buildSearchResults,
  buildCourseLink,
  catCallbackData,
  parseCallbackData,
  CATEGORY_META,
} from '@/lib/telegram';

const COURSE_REGEX = /^[A-Z]{2,5}\d{2,4}[A-Z]?$/i;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

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
    console.error('Telegram webhook error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function handleMessage(msg: any) {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const chatType = msg.chat.type; // 'private', 'group', 'supergroup', 'channel'
  const isGroup = chatType === 'group' || chatType === 'supergroup';

  // In groups, only respond to commands and mentions
  if (isGroup) {
    const botUsername = msg.entities?.some((e: any) => e.type === 'mention' && e.offset === 0);
    const isCommand = msg.entities?.some((e: any) => e.type === 'bot_command' && e.offset === 0);

    // In groups: respond to /start, /help, /search, /departments, /semester, course codes, or mentions
    if (!isCommand && !botUsername && !COURSE_REGEX.test(text)) {
      return; // Ignore random messages in groups
    }
  }

  if (text === '/start') {
    await sendMessage(chatId, buildWelcomeMessage());
    return;
  }

  if (text === '/help') {
    await sendMessage(chatId, buildHelpMessage());
    return;
  }

  if (text === '/departments' || text.startsWith('/departments@')) {
    await sendMessage(chatId, buildDeptList());
    return;
  }

  if (text.startsWith('/semester')) {
    const parts = text.split(/\s+/);
    const semNum = parts[1] || '';
    if (!semNum || !/^[1-8]$/.test(semNum)) {
      await sendMessage(chatId, `Usage: <code>/semester 3</code>\nSemester number must be 1-8.`);
      return;
    }
    await sendMessage(chatId, buildSemesterList(semNum));
    return;
  }

  if (text.startsWith('/search')) {
    const parts = text.replace(/@\S+/, '').split(/\s+/).slice(1);
    const query = parts.join(' ').trim();
    if (!query) {
      await sendMessage(chatId, `Usage: <code>/search notes</code> or <code>/search CSE</code>`);
      return;
    }
    const tree = await getGithubTree();
    await sendMessage(chatId, buildSearchResults(query, tree));
    return;
  }

  // Strip bot mention from text in groups
  const cleanText = text.replace(/@\S+/, '').trim();

  if (COURSE_REGEX.test(cleanText)) {
    const courseCode = cleanText.toUpperCase();
    const tree = await getGithubTree();
    const files = findCourseFiles(tree, courseCode);
    const info = getCourseInfo(files);

    if (!info) {
      await sendMessage(chatId,
        `❌ No files found for <b>${courseCode}</b>.\n\n` +
        `💡 Try:\n` +
        `• Check the course code spelling\n` +
        `• <code>/departments</code> to browse\n` +
        `• <code>/search ${courseCode}</code> to search`
      );
      return;
    }

    // Build category buttons
    const buttons = info.categories.map(cat => {
      const meta = CATEGORY_META[cat];
      return {
        text: `${meta?.icon || '📁'} ${meta?.label || cat}`,
        callback_data: catCallbackData(courseCode, cat),
      };
    });

    const summary = buildCourseResult(courseCode, info);

    await sendMessage(chatId, summary, {
      reply_markup: { inline_keyboard: [buttons] },
    });
    return;
  }

  // Unknown command
  if (text.startsWith('/')) {
    await sendMessage(chatId,
      `🤔 Unknown command.\n\n` +
      `Try:\n` +
      `• <code>QUR101</code> — search a course\n` +
      `• <code>/search notes</code> — search files\n` +
      `• <code>/departments</code> — list departments\n` +
      `• <code>/help</code> — all commands`
    );
    return;
  }

  // Plain text in private chat
  if (!isGroup) {
    await sendMessage(chatId,
      `🤔 Send a course code like <code>QUR101</code> to search.\n\n` +
      `Or try:\n` +
      `• <code>/search notes</code>\n` +
      `• <code>/departments</code>\n` +
      `• <code>/help</code>`
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

  if (parsed.type === 'cat') {
    const [courseCode, category] = parsed.args;
    if (!courseCode || !category) return;

    const tree = await getGithubTree();
    const files = findCourseFiles(tree, courseCode);
    const text = buildCategoryResult(courseCode, category, files);

    // Rebuild buttons with current category highlighted
    const info = getCourseInfo(files);
    const buttons = (info?.categories || []).map(cat => {
      const meta = CATEGORY_META[cat];
      return {
        text: `${cat === category ? '✅ ' : ''}${meta?.icon || '📁'} ${meta?.label || cat}`,
        callback_data: catCallbackData(courseCode, cat),
      };
    });

    // Add "Open on Website" button
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
}
