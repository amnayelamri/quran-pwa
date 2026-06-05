const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');

const app      = express();
const PORT     = 3001;
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE  = path.join(DATA_DIR, 'elements.json');
const UPLOADS  = path.join(DATA_DIR, 'uploads');
const PAGES    = path.join(DATA_DIR, 'pages');

// ── Init storage ──────────────────────────────────────────────────────────────
if (!fs.existsSync(DATA_DIR))  fs.mkdirSync(DATA_DIR,  { recursive: true });
if (!fs.existsSync(UPLOADS))   fs.mkdirSync(UPLOADS,   { recursive: true });
if (!fs.existsSync(DB_FILE))   fs.writeFileSync(DB_FILE, '{}');

function readDB() {
  const raw = fs.readFileSync(DB_FILE, 'utf8').replace(/^﻿/, '').trim();
  return raw ? JSON.parse(raw) : {};
}
function writeDB(data) {
  // Toujours écrire sans BOM
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), { encoding: 'utf8' });
}

// ── Multer (file uploads) ─────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: UPLOADS,
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(UPLOADS));
app.use('/pages',   express.static(PAGES));
app.use('/pwa',     express.static(path.join(__dirname, '..', 'pwa')));
app.use('/dashboard', express.static(path.join(__dirname, 'public')));
// Root → redirect to dashboard
app.get('/', (_req, res) => res.redirect('/dashboard'));

// GET page count
app.get('/api/info', (_req, res) => {
  const files = require('fs').readdirSync(PAGES).filter(f => f.endsWith('.jpg'));
  res.json({ totalPages: files.length });
});

// ── API ───────────────────────────────────────────────────────────────────────

// GET tout le fichier elements.json (pour publication GitHub)
app.get('/api/all-elements', (_req, res) => res.json(readDB()));

// GET all elements for a page
app.get('/api/elements/:page', (req, res) => {
  const db = readDB();
  res.json(db[req.params.page] || []);
});

// GET all pages that have elements (for dashboard overview)
app.get('/api/pages', (req, res) => {
  const db = readDB();
  res.json(Object.keys(db).map(p => ({ page: parseInt(p), count: db[p].length })));
});

// POST add element to a page
app.post('/api/elements/:page', upload.single('file'), (req, res) => {
  const db   = readDB();
  const page = req.params.page;
  if (!db[page]) db[page] = [];

  const { type, title, content } = req.body;
  const element = {
    id:      Date.now().toString(),
    type,
    title:   title   || '',
    content: content || '',
    url:     '',
    createdAt: new Date().toISOString()
  };

  if (req.file) {
    element.url = `/uploads/${req.file.filename}`;
  } else if (req.body.url) {
    element.url = req.body.url;
  }

  db[page].push(element);
  writeDB(db);
  res.json(element);
});

// POST import JSON — fusionne avec les données existantes
app.post('/api/import', (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ error: 'JSON invalide' });
  }

  const db = readDB();
  let added = 0;

  for (const [page, elements] of Object.entries(incoming)) {
    if (!Array.isArray(elements)) continue;
    if (!db[page]) db[page] = [];

    for (const el of elements) {
      // Générer un id unique si absent
      const element = {
        id:        Date.now().toString() + Math.random().toString(36).slice(2),
        type:      el.type    || 'note',
        title:     el.title   || '',
        content:   el.content || '',
        url:       el.url     || '',
        createdAt: el.createdAt || new Date().toISOString()
      };
      db[page].push(element);
      added++;
    }
  }

  writeDB(db);
  res.json({ ok: true, added, pages: Object.keys(incoming).length });
});

// DELETE element
app.delete('/api/elements/:page/:id', (req, res) => {
  const db   = readDB();
  const page = req.params.page;
  if (!db[page]) return res.json({ ok: true });
  db[page] = db[page].filter(e => e.id !== req.params.id);
  if (db[page].length === 0) delete db[page];
  writeDB(db);
  res.json({ ok: true });
});

// PUT update element order (drag-to-reorder)
app.put('/api/elements/:page/reorder', (req, res) => {
  const db   = readDB();
  const page = req.params.page;
  db[page]   = req.body.ids.map(id => (db[page] || []).find(e => e.id === id)).filter(Boolean);
  writeDB(db);
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const os      = require('os');
  const ifaces  = os.networkInterfaces();
  let localIP   = 'localhost';
  Object.values(ifaces).flat().forEach(i => {
    if (i.family === 'IPv4' && !i.internal) localIP = i.address;
  });
  console.log(`\n✅  Dashboard lancé`);
  console.log(`   Dashboard : http://localhost:${PORT}`);
  console.log(`   PWA (téléphone) : http://${localIP}:${PORT}\n`);
  console.log(`   → Dans app.js de la PWA, remplacez localhost par ${localIP}`);
});
