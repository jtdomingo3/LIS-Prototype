const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { parseMarkdown } = require('../lib/markdownHelper');

function resolveManualPath() {
  const candidates = [
    path.join(__dirname, '..', 'docs', 'USER_MANUAL.md'),
    path.join(process.cwd(), 'docs', 'USER_MANUAL.md'),
    path.join(process.cwd(), '..', 'docs', 'USER_MANUAL.md'),
    path.join(__dirname, '..', '..', 'docs', 'USER_MANUAL.md'),
  ];
  if (process.env.DATA_DIR) {
    candidates.unshift(path.join(process.env.DATA_DIR, 'USER_MANUAL.md'));
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// GET /manual - Render the interactive in-app user guide
router.get('/', (req, res) => {
  try {
    const manualPath = resolveManualPath();
    let content = '';
    let lastUpdated = '';

    if (manualPath && fs.existsSync(manualPath)) {
      content = fs.readFileSync(manualPath, 'utf8');
      const stat = fs.statSync(manualPath);
      lastUpdated = new Date(stat.mtime).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } else {
      content = '# System User Manual\n\nUser manual file not found on disk.';
    }

    let parseMarkdownFn = parseMarkdown;
    try {
      delete require.cache[require.resolve('../lib/markdownHelper')];
      parseMarkdownFn = require('../lib/markdownHelper').parseMarkdown;
    } catch (e) {
      parseMarkdownFn = parseMarkdown;
    }

    const { html, toc } = parseMarkdownFn(content);

    res.render('manual', {
      title: 'System User Manual',
      manualHtml: html,
      toc,
      lastUpdated,
      layout: 'layout'
    });
  } catch (err) {
    console.error('[Manual Route] Failed to load manual:', err);
    res.status(500).render('500', {
      title: '500 Server Error',
      error: 'Failed to load user manual: ' + err.message,
      layout: 'layout'
    });
  }
});

// GET /manual/raw - Download or view raw markdown
router.get('/raw', (req, res) => {
  const manualPath = resolveManualPath();
  if (manualPath && fs.existsSync(manualPath)) {
    res.setHeader('Content-Type', 'text/markdown; charset=UTF-8');
    return fs.createReadStream(manualPath).pipe(res);
  }
  res.status(404).send('Manual file not found.');
});

module.exports = router;
