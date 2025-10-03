import { marked } from 'https://cdn.jsdelivr.net/npm/marked@11.2.0/lib/marked.esm.js';
import createDOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.0.8/dist/purify.es.mjs';

const DOMPurify = createDOMPurify(window);

marked.setOptions({
  gfm: true,
  breaks: true,
  mangle: false,
  headerIds: false,
});

/**
 * 将 Markdown 文本渲染为经过净化的 HTML 字符串。
 * @param {string} markdown - 待渲染的 Markdown 文本
 * @param {{ inline?: boolean }} [options]
 * @returns {string}
 */
export function renderMarkdown(markdown, options = {}) {
  const { inline = false } = options;
  const source = typeof markdown === 'string' ? markdown : '';
  if (!source.trim()) {
    return '';
  }

  const html = inline ? marked.parseInline(source) : marked.parse(source);
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
