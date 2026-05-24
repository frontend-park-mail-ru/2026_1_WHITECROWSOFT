import { createServer } from 'node:http';

const PORT = Number(process.env.PORT) || 3000;
const INDEX_URL = process.env.INDEX_URL || 'http://frontend/';
const API_BASE = process.env.API_BASE || 'http://main:8000';
const SITE_TAGLINE = process.env.SITE_TAGLINE || 'Прочитайте эту заметку в Noterian!';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let indexHtml = null;

async function loadIndex() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const res = await fetch(INDEX_URL, { headers: { accept: 'text/html' } });
      if (res.ok) {
        indexHtml = await res.text();
        console.log(`[og-sidecar] loaded index.html (${indexHtml.length} bytes) from ${INDEX_URL}`);
        return;
      }
    } catch (err) {
      console.log(`[og-sidecar] failed to load index.html from ${INDEX_URL} (attempt ${attempt + 1})`, err)
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`failed to load index.html from ${INDEX_URL} after 60 attempts`);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtml({ title, description, url }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const u = escapeHtml(url);
  const tags = [
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:site_name" content="Noterian" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
  ].join('\n\t\t');

  return indexHtml
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${t}</title>`)
    .replace(/<\/head>/i, `\t\t${tags}\n\t</head>`);
}

async function fetchPublicNote(noteId) {
  const res = await fetch(`${API_BASE}/public/notes/${noteId}`, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) return null;
  return res.json();
}

const server = createServer(async (req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');

  let parsed;
  try {
    parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    res.end(indexHtml);
    return;
  }

  const noteId = parsed.searchParams.get('note');
  if (!noteId || !UUID_RE.test(noteId)) {
    res.end(indexHtml);
    return;
  }

  try {
    const note = await fetchPublicNote(noteId);
    if (!note || !note.title) {
      res.end(indexHtml);
      return;
    }
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'noterian.ru';
    const shareUrl = `${proto}://${host}/?note=${noteId}`;
    res.end(buildHtml({ title: note.title, description: SITE_TAGLINE, url: shareUrl }));
  } catch (err) {
    console.error('[og-sidecar] request error:', err);
    res.end(indexHtml);
  }
});

await loadIndex();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[og-sidecar] listening on :${PORT}`);
});
