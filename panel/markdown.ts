import { marked } from 'marked';
import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'ul', 'ol', 'li',
  'blockquote',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'em', 'strong', 'del', 'ins', 'code', 'pre',
  'a', 'span',
];

const ALLOWED_ATTR = ['href', 'title'];

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node instanceof HTMLAnchorElement) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Override image rendering to show remote images as links (ADR-0012)
// breaks: true restores markdown-it behavior — single newlines become <br>,
// which matters for Engram's mem_save template (single-newline sections).
marked.use({
  breaks: true,
  renderer: {
    image(href: string, title: string, text: string): string {
      const label = text || href;
      const safeTitle = escapeHtml(title || '');
      return `<a href="${escapeHtml(href)}" title="${safeTitle}">image: ${escapeHtml(label)}</a>`;
    },
  },
});

export function renderMarkdown(source: string): string {
  const rendered = marked.parse(source);
  return DOMPurify.sanitize(rendered, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
}

export function renderMarkdownInto(container: HTMLElement, source: string, onOpenUrl: (url: string) => void): void {
  container.innerHTML = renderMarkdown(source);
  container.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLAnchorElement)) return;
    event.preventDefault();
    const href = target.getAttribute('href');
    if (href) onOpenUrl(href);
  });
}
