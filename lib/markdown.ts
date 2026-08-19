import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  gfm: true,
  breaks: false,
});

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'strong', 'em', 'del', 's',
  'a', 'img',
  'ul', 'ol', 'li',
  'blockquote',
  'pre', 'code',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'input',
  'figure', 'figcaption',
  'dl', 'dt', 'dd',
  'details', 'summary',
];

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title', 'class', 'target', 'rel',
  'width', 'height', 'align', 'valign',
  'type', 'checked', 'disabled',
];

function sanitize(html: string): string {
  if (typeof window !== 'undefined') {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
    }) as string;
  }
  return html;
}

const renderer = new marked.Renderer();

renderer.link = function (token: any) {
  const href = token.href || '';
  const title = token.title || '';
  const text = token.text || '';
  const safeHref = /^(https?:|mailto:|#)/i.test(href) ? href : '#';
  const titleAttr = title ? ` title="${title}"` : '';
  return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
};

renderer.image = function (token: any) {
  const href = token.href || '';
  const title = token.title || '';
  const text = token.text || '';
  const alt = text ? ` alt="${text}"` : '';
  const titleAttr = title ? ` title="${title}"` : '';
  return `<img src="${href}"${alt}${titleAttr} loading="lazy" />`;
};

renderer.code = function (token: any) {
  const text = token.text || '';
  const lang = token.lang || '';
  const langClass = lang ? ` class="language-${lang}"` : '';
  return `<pre><code${langClass}>${text}</code></pre>`;
};

marked.use({ renderer });

export function renderMarkdown(src: string): string {
  const raw = marked.parse(src) as string;
  return sanitize(raw);
}
