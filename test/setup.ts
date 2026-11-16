// Preloaded by `bun test` (see bunfig.toml). DOMPurify binds to `window` at
// import time and `panel/markdown.ts` registers a hook then, so a DOM must exist
// before any module that imports dompurify is evaluated.
//
// jsdom is used rather than happy-dom: DOMPurify reads `nodeName` through the
// `Node.prototype` getter, and happy-dom's `Node.prototype.nodeName` returns an
// empty string (the real getter lives on `Element.prototype`), which makes
// DOMPurify treat every tag as disallowed. jsdom exposes the standard getter.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://localhost/' });

// Expose the DOM globals DOMPurify and the panel code rely on.
const globals = [
  'window',
  'document',
  'navigator',
  'location',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLAnchorElement',
  'DocumentFragment',
  'NodeFilter',
  'DOMParser',
  'Event',
  'MouseEvent',
  'CustomEvent',
] as const;

for (const key of globals) {
  (globalThis as Record<string, unknown>)[key] = (dom.window as unknown as Record<string, unknown>)[key];
}
