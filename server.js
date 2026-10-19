const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ─── Load Offsets Database ───────────────────────────────────────────────────
const dataFilePath = path.join(__dirname, 'offsets_data.json');
let offsetsDb = {};

try {
  const rawData = fs.readFileSync(dataFilePath, 'utf8');
  offsetsDb = JSON.parse(rawData);
  console.log(` Loaded offsets data for ${Object.keys(offsetsDb).length} games.`);
} catch (err) {
  console.error('❌ Failed to load offsets_data.json:', err.message);
}

// Helper to resolve game slugs and aliases
function resolveGame(query) {
  if (!query) return null;
  const clean = query.trim().toLowerCase().replace(/[\s_]+/g, '-');
  
  if (offsetsDb[clean]) return offsetsDb[clean];

  // Alias mappings
  const aliases = {
    'ff': 'free-fire',
    'freefire': 'free-fire',
    'bo7': 'cod-bo7',
    'cod': 'cod-bo7',
    'blackops7': 'cod-bo7',
    'call-of-duty-black-ops-7': 'cod-bo7',
    'tslgame': 'pubg',
    'bs': 'bloodstrike',
    'blood-strike': 'bloodstrike',
    'hw2': 'hood-warfare-2',
    'hoodwarfare2': 'hood-warfare-2',
    'hood-warfare': 'hood-warfare-2',
    'r6': 'rainbow-six-siege',
    'r6s': 'rainbow-six-siege',
    'rainbow6': 'rainbow-six-siege',
    'rainbowsix': 'rainbow-six-siege',
    'rainbow-six': 'rainbow-six-siege',
    'siege': 'rainbow-six-siege'
  };

  const targetSlug = aliases[clean];
  if (targetSlug && offsetsDb[targetSlug]) {
    return offsetsDb[targetSlug];
  }

  // Fallback search by name or key prefix
  for (const key of Object.keys(offsetsDb)) {
    const g = offsetsDb[key];
    if (g.name.toLowerCase() === clean || key.includes(clean)) {
      return g;
    }
  }

  return null;
}

// ─── API Routes ──────────────────────────────────────────────────────────────

// Root info
app.get('/', (req, res) => {
  res.json({
    success: true,
    name: "HX SyncOffset API Engine",
    version: "2.0.0",
    developer: "HX Corporation • Powered by DEV HX",
    endpoints: [
      "GET /api/games",
      "GET /api/games/:game",
      "GET /api/games/:game/current",
      "GET /api/games/:game/offsets",
      "GET /api/games/:game/raw",
      "GET /api/games/:game/offset/:key",
      "GET /api/games/:game/search?q=:query"
    ]
  });
});

// GET all supported games summary
app.get('/api/games', (req, res) => {
  const games = Object.keys(offsetsDb).map(key => {
    const g = offsetsDb[key];
    return {
      slug: g.slug,
      name: g.name,
      version: g.version,
      updated: g.updated,
      accent: g.accent,
      tagline: g.tagline,
      total_offsets: g.total_offsets
    };
  });
  res.json({ success: true, count: games.length, games });
});

// GET current offsets for a specific game
app.get(['/api/games/:game', '/api/games/:game/current'], (req, res) => {
  const game = resolveGame(req.params.game);
  if (!game) {
    return res.status(404).json({
      success: false,
      error: `Game "${req.params.game}" not found.`,
      available_games: Object.keys(offsetsDb)
    });
  }

  res.json({
    success: true,
    slug: game.slug,
    name: game.name,
    version: game.version,
    updated: game.updated,
    accent: game.accent,
    tagline: game.tagline,
    total_offsets: game.total_offsets,
    offsets_flat: game.offsets,
    offsets: game.offsets,
    raw: game.raw
  });
});

// GET only offsets JSON (smaller payload)
app.get('/api/games/:game/offsets', (req, res) => {
  const game = resolveGame(req.params.game);
  if (!game) {
    return res.status(404).json({ success: false, error: `Game "${req.params.game}" not found.` });
  }
  res.json({
    success: true,
    slug: game.slug,
    name: game.name,
    version: game.version,
    offsets: game.offsets
  });
});

// GET raw dump text
app.get('/api/games/:game/raw', (req, res) => {
  const game = resolveGame(req.params.game);
  if (!game) {
    return res.status(404).send(`Game "${req.params.game}" not found.`);
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(game.raw || "");
});

// GET a specific offset by key
app.get('/api/games/:game/offset/:key', (req, res) => {
  const game = resolveGame(req.params.game);
  if (!game) {
    return res.status(404).json({ success: false, error: `Game "${req.params.game}" not found.` });
  }

  const reqKey = req.params.key.trim().toLowerCase();
  const offsets = game.offsets || {};
  
  // Direct or case-insensitive match
  let foundKey = null;
  for (const k of Object.keys(offsets)) {
    if (k.toLowerCase() === reqKey) {
      foundKey = k;
      break;
    }
  }

  if (!foundKey) {
    return res.status(404).json({
      success: false,
      error: `Offset "${req.params.key}" not found for "${game.name}".`,
      sample_offsets: Object.keys(offsets).slice(0, 10)
    });
  }

  res.json({
    success: true,
    game: game.slug,
    name: game.name,
    key: foundKey,
    value: offsets[foundKey]
  });
});

// Search offsets by query string
app.get('/api/games/:game/search', (req, res) => {
  const game = resolveGame(req.params.game);
  if (!game) {
    return res.status(404).json({ success: false, error: `Game "${req.params.game}" not found.` });
  }

  const query = (req.query.q || "").trim().toLowerCase();
  if (!query) {
    return res.status(400).json({ success: false, error: "Missing 'q' query parameter." });
  }

  const matches = {};
  const offsets = game.offsets || {};
  for (const [k, v] of Object.entries(offsets)) {
    if (k.toLowerCase().includes(query) || String(v).toLowerCase().includes(query)) {
      matches[k] = v;
    }
  }

  res.json({
    success: true,
    game: game.slug,
    query,
    total_matches: Object.keys(matches).length,
    matches
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ HX SyncOffset API running at http://localhost:${PORT}`);
});
