/**
 * Lightweight, zero-dependency Markdown-to-HTML converter
 * Specifically tuned for technical documentation, user manuals, and offline execution
 * with comprehensive KaTeX LaTeX math rendering support.
 */

let katex = null;
try {
  katex = require('katex');
} catch (e) {
  // Graceful fallback to client-side KaTeX rendering
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/___KATEX_[A-Z]+_\d+___/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-');
}

function parseMarkdown(md) {
  if (!md) return { html: '', toc: [] };

  const mathBlocks = [];

  // Normalize line breaks
  let processedMd = String(md).replace(/\r\n/g, '\n');

  // 1. Extract Display Math: $$ ... $$ or \[ ... \]
  processedMd = processedMd.replace(/(\$\$|\\\[)([\s\S]+?)(\$\$|\\\])/g, (match, open, math) => {
    const placeholder = '___KATEX_DISPLAY_' + mathBlocks.length + '___';
    const rawMath = math.trim();
    let html = '';
    if (katex) {
      try {
        html = '<div class="katex-display">' + katex.renderToString(rawMath, { displayMode: true, throwOnError: false }) + '</div>';
      } catch (err) {
        html = '<div class="katex-display katex-error">' + escapeHtml(rawMath) + '</div>';
      }
    } else {
      html = '<div class="katex-display" data-expr="' + escapeHtml(rawMath) + '">$$' + escapeHtml(rawMath) + '$$</div>';
    }
    mathBlocks.push({ placeholder, html });
    return '\n\n' + placeholder + '\n\n';
  });

  // 2. Extract Inline Math: \( ... \)
  processedMd = processedMd.replace(/\\\(([\s\S]+?)\\\)/g, (match, math) => {
    const placeholder = '___KATEX_INLINE_' + mathBlocks.length + '___';
    const rawMath = math.trim();
    let html = '';
    if (katex) {
      try {
        html = '<span class="katex-inline">' + katex.renderToString(rawMath, { displayMode: false, throwOnError: false }) + '</span>';
      } catch (err) {
        html = '<span class="katex-inline katex-error">' + escapeHtml(rawMath) + '</span>';
      }
    } else {
      html = '<span class="katex-inline" data-expr="' + escapeHtml(rawMath) + '">\\(' + escapeHtml(rawMath) + '\\)</span>';
    }
    mathBlocks.push({ placeholder, html });
    return placeholder;
  });

  // 3. Extract Inline Math: $ ... $ (excluding plain currency numbers like $50 or $100.50)
  processedMd = processedMd.replace(/(^|[^\$])\$([^\$\n\r]+?)\$(?!\$)/g, (match, prefix, math) => {
    if (/^\s*\d+([.,]\d+)?\s*$/.test(math)) return match;
    const placeholder = '___KATEX_INLINE_' + mathBlocks.length + '___';
    const rawMath = math.trim();
    let html = '';
    if (katex) {
      try {
        html = '<span class="katex-inline">' + katex.renderToString(rawMath, { displayMode: false, throwOnError: false }) + '</span>';
      } catch (err) {
        html = '<span class="katex-inline katex-error">' + escapeHtml(rawMath) + '</span>';
      }
    } else {
      html = '<span class="katex-inline" data-expr="' + escapeHtml(rawMath) + '">$' + escapeHtml(rawMath) + '$</span>';
    }
    mathBlocks.push({ placeholder, html });
    return prefix + placeholder;
  });

  const lines = processedMd.split('\n');
  const toc = [];
  const out = [];

  let inList = false;
  let listType = null; // 'ul' or 'ol'
  let inTable = false;
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines = [];

  let inParagraph = false;
  let paragraphLines = [];

  function closeParagraph() {
    if (inParagraph && paragraphLines.length > 0) {
      out.push(`<p class="manual-p">${paragraphLines.map(formatInline).join('<br />')}</p>`);
      inParagraph = false;
      paragraphLines = [];
    }
  }

  function closeList() {
    if (inList) {
      out.push(listType === 'ol' ? '</ol>' : '</ul>');
      inList = false;
      listType = null;
    }
  }

  function closeTable() {
    if (inTable) {
      out.push('</tbody></table></div>');
      inTable = false;
    }
  }

  function formatInline(str) {
    let s = escapeHtml(str);

    // Allow and normalize explicit HTML line breaks (<br>, <br/>, <br />)
    s = s.replace(/&lt;br\s*\/?&gt;/gi, '<br />');

    // Bold + Italic (***text***)
    s = s.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');

    // Bold (**text**)
    s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Italic (*text*)
    s = s.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Inline Code (`code`)
    s = s.replace(/`([^`]+)`/g, '<code class="manual-code">$1</code>');

    // Arrows
    s = s.replace(/&amp;rarr;/g, '&rarr;').replace(/&rarr;/g, '<span class="step-arrow">&rarr;</span>');

    return s;
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 0. Standalone Display Math Block
    if (trimmed.startsWith('___KATEX_DISPLAY_') && trimmed.endsWith('___')) {
      closeParagraph();
      closeList();
      closeTable();
      out.push(trimmed);
      continue;
    }

    // 1. Code Blocks
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        // closing code block
        out.push('<pre class="manual-pre"><code class="lang-' + escapeHtml(codeBlockLang) + '">' + escapeHtml(codeBlockLines.join('\n')) + '</code></pre>');
        inCodeBlock = false;
        codeBlockLines = [];
        codeBlockLang = '';
      } else {
        closeParagraph();
        closeList();
        closeTable();
        inCodeBlock = true;
        codeBlockLang = trimmed.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    // 2. Horizontal Rule (matches ---, ***, ___, and longer)
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      closeParagraph();
      closeList();
      closeTable();
      out.push('<hr class="manual-hr" />');
      continue;
    }

    // 3. Headings
    const headingMatch = rawLine.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeParagraph();
      closeList();
      closeTable();
      const level = headingMatch[1].length;
      const titleText = headingMatch[2].trim();
      const slug = slugify(titleText) || `section-${i}`;

      if (level <= 3) {
        toc.push({
          level,
          text: titleText.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/`([^`]+)`/g, '$1'),
          slug
        });
      }

      out.push(`<h${level} id="${slug}" class="manual-h${level}">${formatInline(titleText)}</h${level}>`);
      continue;
    }

    // 4. Blockquotes / Alerts
    if (trimmed.startsWith('>')) {
      closeParagraph();
      closeList();
      closeTable();
      let alertContent = trimmed.replace(/^>\s?/, '');
      let alertClass = 'manual-blockquote';

      if (alertContent.startsWith('[!NOTE]')) {
        alertClass += ' alert-box alert-note';
        alertContent = alertContent.replace('[!NOTE]', '<strong>Note:</strong>');
      } else if (alertContent.startsWith('[!WARNING]')) {
        alertClass += ' alert-box alert-warning';
        alertContent = alertContent.replace('[!WARNING]', '<strong>Warning:</strong>');
      } else if (alertContent.startsWith('[!IMPORTANT]')) {
        alertClass += ' alert-box alert-important';
        alertContent = alertContent.replace('[!IMPORTANT]', '<strong>Important:</strong>');
      } else if (alertContent.startsWith('[!TIP]')) {
        alertClass += ' alert-box alert-tip';
        alertContent = alertContent.replace('[!TIP]', '<strong>Tip:</strong>');
      }

      out.push(`<blockquote class="${alertClass}">${formatInline(alertContent)}</blockquote>`);
      continue;
    }

    // 5. Tables
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      closeParagraph();
      closeList();
      const cells = trimmed.slice(1, -1).split('|').map(c => c.trim());

      // Check if separator line
      if (cells.every(c => /^:?-+:?$/.test(c))) {
        // Table divider, ignore line
        continue;
      }

      if (!inTable) {
        inTable = true;
        out.push('<div class="table-responsive"><table class="manual-table"><thead><tr>');
        cells.forEach(c => out.push(`<th>${formatInline(c)}</th>`));
        out.push('</tr></thead><tbody>');
      } else {
        out.push('<tr>');
        cells.forEach(c => out.push(`<td>${formatInline(c)}</td>`));
        out.push('</tr>');
      }
      continue;
    } else {
      closeTable();
    }

    // 6. Ordered Lists (1. item)
    const olMatch = rawLine.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (olMatch) {
      closeParagraph();
      if (!inList || listType !== 'ol') {
        closeList();
        inList = true;
        listType = 'ol';
        out.push('<ol class="manual-list manual-ol">');
      }
      out.push(`<li>${formatInline(olMatch[3])}</li>`);
      continue;
    }

    // 7. Unordered Lists (* or - item)
    const ulMatch = rawLine.match(/^(\s*)[*-]\s+(.*)$/);
    if (ulMatch) {
      closeParagraph();
      if (!inList || listType !== 'ul') {
        closeList();
        inList = true;
        listType = 'ul';
        out.push('<ul class="manual-list manual-ul">');
      }
      out.push(`<li>${formatInline(ulMatch[2])}</li>`);
      continue;
    }

    // 8. Empty lines
    if (trimmed === '') {
      closeParagraph();
      closeList();
      closeTable();
      continue;
    }

    // 9. Regular Paragraph (accumulate lines so multi-line paragraphs render with clean <br /> breaks)
    closeList();
    closeTable();
    inParagraph = true;
    paragraphLines.push(trimmed);
  }

  closeParagraph();
  closeList();
  closeTable();

  // Re-inject rendered KaTeX math blocks into HTML
  let finalHtml = out.join('\n');
  mathBlocks.forEach(item => {
    finalHtml = finalHtml.split(item.placeholder).join(item.html);
  });

  // Re-inject rendered KaTeX math blocks into TOC text
  toc.forEach(t => {
    mathBlocks.forEach(item => {
      t.text = t.text.split(item.placeholder).join(item.html);
    });
  });

  return {
    html: finalHtml,
    toc
  };
}

module.exports = {
  parseMarkdown,
  renderMarkdown: (md) => parseMarkdown(md).html,
  extractTOC: (md) => parseMarkdown(md).toc,
  escapeHtml,
  slugify
};
