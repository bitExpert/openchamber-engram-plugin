import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

md.validateLink = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

// OpenChamber >= 2.0.4 serves extension pages under a policy that keeps them
// off the network, so a remote `<img>` never loads. Render images as links
// instead; `renderMarkdownInto` routes the click through `host.openUrl`.
const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

md.renderer.rules.image = (tokens, idx) => {
  const token = tokens[idx];
  const src = String(token.attrGet('src') ?? '');
  const alt = (token.children ?? []).map((child) => child.content).join('').trim();
  const label = alt || src;
  return `<a href="${escapeHtml(src)}" title="${escapeHtml(alt)}">image: ${escapeHtml(label)}</a>`;
};

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

export function renderMarkdown(source: string): string {
  const rendered = md.render(source);
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