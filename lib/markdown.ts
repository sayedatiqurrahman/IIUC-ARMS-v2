// Minimal, dependency-free Markdown -> HTML renderer for the upload Markdown
// editor preview. It escapes all HTML first and only ever emits a whitelist of
// safe tags, so user-authored Markdown can never inject scripts (no XSS).

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(text: string): string {
  let t = escapeHtml(text);

  // Protect inline code spans so formatting isn't applied inside them.
  const codes: string[] = [];
  t = t.replace(/`([^`]+)`/g, (_m: string, c: string) => {
    codes.push(c);
    return ' X' + (codes.length - 1) + 'X ';
  });

  // Links — only allow http(s) / mailto destinations.
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m: string, label: string, url: string) => {
    const safe = /^(https?:|mailto:)/i.test(url) ? url : '#';
    return '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
  });

  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>');
  t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Restore code spans (content already escaped).
  t = t.replace(/ X(\d+)X /g, (_m: string, idx: string) => '<code>' + codes[Number(idx)] + '</code>');
  return t;
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];
  let paragraph: string[] = [];

  const flushList = () => {
    if (listType) {
      out.push('<' + listType + '>' + listItems.map(li => '<li>' + inline(li) + '</li>').join('') + '</' + listType + '>');
      listType = null;
      listItems = [];
    }
  };
  const flushPara = () => {
    if (paragraph.length) {
      out.push('<p>' + paragraph.map(inline).join('<br>') + '</p>');
      paragraph = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      flushPara();
      flushList();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      out.push('<pre><code>' + escapeHtml(buf.join('\n')) + '</code></pre>');
      continue;
    }

    if (/^\s*$/.test(line)) {
      flushPara();
      flushList();
      i++;
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      flushList();
      const lvl = h[1].length;
      out.push('<h' + lvl + '>' + inline(h[2]) + '</h' + lvl + '>');
      i++;
      continue;
    }

    if (/^\s*---\s*$/.test(line)) {
      flushPara();
      flushList();
      out.push('<hr>');
      i++;
      continue;
    }

    const bq = line.match(/^>\s?(.*)$/);
    if (bq) {
      flushPara();
      flushList();
      out.push('<blockquote>' + inline(bq[1]) + '</blockquote>');
      i++;
      continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listItems.push(ul[1]);
      i++;
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      flushPara();
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listItems.push(ol[1]);
      i++;
      continue;
    }

    flushList();
    paragraph.push(line);
    i++;
  }

  flushPara();
  flushList();
  return out.join('\n');
}
