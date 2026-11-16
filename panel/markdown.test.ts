import { describe, expect, test } from 'bun:test';

import { renderMarkdown, renderMarkdownInto } from './markdown';

describe('renderMarkdown', () => {
  test('renders Markdown to HTML', () => {
    const html = renderMarkdown('**bold** and *em*');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>em</em>');
  });

  test('turns single newlines into <br> (breaks: true)', () => {
    expect(renderMarkdown('line one\nline two')).toContain('<br>');
  });

  test('keeps the allowed block tags', () => {
    const html = renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |\n\n```\ncode\n```');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<code>');
  });

  test('drops <script> and its contents', () => {
    const html = renderMarkdown('before <script>alert("xss")</script> after');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert');
  });

  test('drops disallowed elements such as <iframe> and <style>', () => {
    const html = renderMarkdown('<iframe src="https://evil"></iframe><style>body{}</style>ok');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<style');
    expect(html).toContain('ok');
  });

  test('strips event-handler attributes', () => {
    const html = renderMarkdown('<a href="https://x" onclick="evil()">x</a>');
    expect(html).not.toContain('onclick');
  });

  test('strips javascript: URLs', () => {
    const html = renderMarkdown('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  test('opens links in a new tab with a safe rel', () => {
    const html = renderMarkdown('[site](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test('renders remote images as links (ADR-0012)', () => {
    const html = renderMarkdown('![alt text](https://example.com/a.png)');
    expect(html).not.toContain('<img');
    expect(html).toContain('<a href="https://example.com/a.png"');
    expect(html).toContain('image: alt text');
  });
});

describe('renderMarkdownInto', () => {
  test('injects sanitized HTML and routes link clicks through the callback', () => {
    const container = document.createElement('div');
    const opened: string[] = [];
    renderMarkdownInto(container, '[site](https://example.com)', (url) => opened.push(url));

    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    anchor?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(opened).toEqual(['https://example.com']);
  });
});
