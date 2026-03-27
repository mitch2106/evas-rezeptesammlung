const express = require('express');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ============ DATABASE ABSTRACTION ============
// Automatically uses PostgreSQL if DATABASE_URL is set (cloud),
// otherwise falls back to SQLite via sql.js (local)

let dbAdapter;

// --- PostgreSQL Adapter ---
function createPgAdapter(pool) {
  return {
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS recipes (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          title TEXT NOT NULL,
          category TEXT DEFAULT '',
          portions INTEGER,
          tags TEXT DEFAULT '[]',
          source_url TEXT DEFAULT '',
          ingredients TEXT DEFAULT '',
          preparation TEXT DEFAULT '',
          image TEXT DEFAULT '',
          notes TEXT DEFAULT '',
          is_favorite INTEGER DEFAULT 0,
          last_viewed TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS shopping_items (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          recipe_id TEXT,
          recipe_title TEXT DEFAULT '',
          text TEXT NOT NULL,
          category TEXT DEFAULT 'Sonstiges',
          checked INTEGER DEFAULT 0,
          sort_order INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS planner_entries (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
          date TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
    },
    async queryAll(sql, params = []) {
      const { rows } = await pool.query(convertPlaceholders(sql), params);
      return rows;
    },
    async queryOne(sql, params = []) {
      const { rows } = await pool.query(convertPlaceholders(sql), params);
      return rows[0] || null;
    },
    async run(sql, params = []) {
      await pool.query(convertPlaceholders(sql), params);
    }
  };
}

// Convert ? placeholders to $1, $2, ... for PostgreSQL
function convertPlaceholders(sql) {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

// --- SQLite Adapter (sql.js) ---
function createSqliteAdapter() {
  const DB_PATH = path.join(__dirname, 'rezepte.db');
  let db;

  function saveDB() {
    if (db) {
      const data = db.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    }
  }

  return {
    async init() {
      const initSqlJs = require('sql.js');
      const SQL = await initSqlJs();
      if (fs.existsSync(DB_PATH)) {
        db = new SQL.Database(fs.readFileSync(DB_PATH));
      } else {
        db = new SQL.Database();
      }
      db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
      db.run(`CREATE TABLE IF NOT EXISTS recipes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, category TEXT DEFAULT '', portions INTEGER, tags TEXT DEFAULT '[]', source_url TEXT DEFAULT '', ingredients TEXT DEFAULT '', preparation TEXT DEFAULT '', image TEXT DEFAULT '', notes TEXT DEFAULT '', is_favorite INTEGER DEFAULT 0, last_viewed DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))`);
      db.run(`CREATE TABLE IF NOT EXISTS shopping_items (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, recipe_id TEXT, recipe_title TEXT DEFAULT '', text TEXT NOT NULL, category TEXT DEFAULT 'Sonstiges', checked INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))`);
      db.run(`CREATE TABLE IF NOT EXISTS planner_entries (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, recipe_id TEXT NOT NULL, date TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (recipe_id) REFERENCES recipes(id))`);
      saveDB();

      // Auto-save every 30s
      setInterval(saveDB, 30000);
      process.on('SIGINT', () => { saveDB(); process.exit(); });
      process.on('SIGTERM', () => { saveDB(); process.exit(); });
    },
    async queryAll(sql, params = []) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const results = [];
      while (stmt.step()) results.push(stmt.getAsObject());
      stmt.free();
      return results;
    },
    async queryOne(sql, params = []) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      let result = null;
      if (stmt.step()) result = stmt.getAsObject();
      stmt.free();
      return result;
    },
    async run(sql, params = []) {
      db.run(sql, params);
      saveDB();
    }
  };
}

// ============ API ROUTES ============

// --- Users ---
app.get('/api/users', async (req, res) => {
  try {
    res.json(await dbAdapter.queryAll('SELECT * FROM users ORDER BY name'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name ist erforderlich' });
    const id = uuidv4();
    await dbAdapter.run('INSERT INTO users (id, name) VALUES (?, ?)', [id, name.trim()]);
    res.json({ id, name: name.trim() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await dbAdapter.queryOne('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    res.json(user);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Recipes ---
app.get('/api/recipes', async (req, res) => {
  try {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'user_id erforderlich' });
    res.json(await dbAdapter.queryAll('SELECT * FROM recipes WHERE user_id = ? ORDER BY created_at DESC', [userId]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/recipes/:id', async (req, res) => {
  try {
    const recipe = await dbAdapter.queryOne('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
    if (!recipe) return res.status(404).json({ error: 'Rezept nicht gefunden' });
    await dbAdapter.run('UPDATE recipes SET last_viewed = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
    recipe.last_viewed = new Date().toISOString();
    res.json(recipe);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/recipes', async (req, res) => {
  try {
    const { user_id, title, category, portions, tags, source_url, ingredients, preparation, image, notes } = req.body;
    if (!user_id || !title) return res.status(400).json({ error: 'user_id und title sind erforderlich' });
    const id = uuidv4();
    await dbAdapter.run(
      'INSERT INTO recipes (id, user_id, title, category, portions, tags, source_url, ingredients, preparation, image, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, user_id, title, category || '', portions || null, JSON.stringify(tags || []), source_url || '', ingredients || '', preparation || '', image || '', notes || '']
    );
    const recipe = await dbAdapter.queryOne('SELECT * FROM recipes WHERE id = ?', [id]);
    res.json(recipe);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/recipes/:id', async (req, res) => {
  try {
    const { title, category, portions, tags, source_url, ingredients, preparation, image, notes, is_favorite } = req.body;
    const existing = await dbAdapter.queryOne('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Rezept nicht gefunden' });
    await dbAdapter.run(
      'UPDATE recipes SET title=?, category=?, portions=?, tags=?, source_url=?, ingredients=?, preparation=?, image=?, notes=?, is_favorite=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
      [title ?? existing.title, category ?? existing.category, portions ?? existing.portions,
       tags ? JSON.stringify(tags) : existing.tags, source_url ?? existing.source_url,
       ingredients ?? existing.ingredients, preparation ?? existing.preparation,
       image ?? existing.image, notes ?? existing.notes, is_favorite ?? existing.is_favorite, req.params.id]
    );
    res.json(await dbAdapter.queryOne('SELECT * FROM recipes WHERE id = ?', [req.params.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/recipes/:id/favorite', async (req, res) => {
  try {
    const recipe = await dbAdapter.queryOne('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
    if (!recipe) return res.status(404).json({ error: 'Rezept nicht gefunden' });
    const newFav = recipe.is_favorite ? 0 : 1;
    await dbAdapter.run('UPDATE recipes SET is_favorite = ? WHERE id = ?', [newFav, req.params.id]);
    res.json({ is_favorite: newFav });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/recipes/:id', async (req, res) => {
  try {
    await dbAdapter.run('DELETE FROM planner_entries WHERE recipe_id = ?', [req.params.id]);
    await dbAdapter.run('DELETE FROM shopping_items WHERE recipe_id = ?', [req.params.id]);
    await dbAdapter.run('DELETE FROM recipes WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Shopping ---
app.get('/api/shopping', async (req, res) => {
  try {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'user_id erforderlich' });
    res.json(await dbAdapter.queryAll('SELECT * FROM shopping_items WHERE user_id = ? ORDER BY sort_order, created_at', [userId]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/shopping', async (req, res) => {
  try {
    const { user_id, text, recipe_id, recipe_title, category } = req.body;
    if (!user_id || !text) return res.status(400).json({ error: 'user_id und text sind erforderlich' });
    const id = uuidv4();
    await dbAdapter.run('INSERT INTO shopping_items (id, user_id, text, recipe_id, recipe_title, category) VALUES (?, ?, ?, ?, ?, ?)',
      [id, user_id, text, recipe_id || null, recipe_title || '', category || 'Sonstiges']);
    res.json(await dbAdapter.queryOne('SELECT * FROM shopping_items WHERE id = ?', [id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/shopping/bulk', async (req, res) => {
  try {
    const { user_id, items } = req.body;
    if (!user_id || !items || !items.length) return res.status(400).json({ error: 'user_id und items sind erforderlich' });
    for (const item of items) {
      await dbAdapter.run('INSERT INTO shopping_items (id, user_id, text, recipe_id, recipe_title, category) VALUES (?, ?, ?, ?, ?, ?)',
        [uuidv4(), user_id, item.text, item.recipe_id || null, item.recipe_title || '', item.category || 'Sonstiges']);
    }
    res.json(await dbAdapter.queryAll('SELECT * FROM shopping_items WHERE user_id = ? ORDER BY sort_order, created_at', [user_id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/shopping/:id/toggle', async (req, res) => {
  try {
    const item = await dbAdapter.queryOne('SELECT * FROM shopping_items WHERE id = ?', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Item nicht gefunden' });
    await dbAdapter.run('UPDATE shopping_items SET checked = ? WHERE id = ?', [item.checked ? 0 : 1, req.params.id]);
    res.json({ checked: item.checked ? 0 : 1 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/shopping/check-all', async (req, res) => {
  try {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'user_id erforderlich' });
    await dbAdapter.run('UPDATE shopping_items SET checked = 1 WHERE user_id = ?', [userId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/shopping/checked', async (req, res) => {
  try {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'user_id erforderlich' });
    await dbAdapter.run('DELETE FROM shopping_items WHERE user_id = ? AND checked = 1', [userId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/shopping/all', async (req, res) => {
  try {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'user_id erforderlich' });
    await dbAdapter.run('DELETE FROM shopping_items WHERE user_id = ?', [userId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Planner ---
app.get('/api/planner', async (req, res) => {
  try {
    const { user_id, start_date, end_date } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id erforderlich' });
    const sql = start_date && end_date
      ? 'SELECT pe.*, r.title as recipe_title, r.category as recipe_category, r.image as recipe_image FROM planner_entries pe JOIN recipes r ON pe.recipe_id = r.id WHERE pe.user_id = ? AND pe.date >= ? AND pe.date <= ? ORDER BY pe.date'
      : 'SELECT pe.*, r.title as recipe_title, r.category as recipe_category, r.image as recipe_image FROM planner_entries pe JOIN recipes r ON pe.recipe_id = r.id WHERE pe.user_id = ? ORDER BY pe.date';
    const params = start_date && end_date ? [user_id, start_date, end_date] : [user_id];
    res.json(await dbAdapter.queryAll(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/planner', async (req, res) => {
  try {
    const { user_id, recipe_id, date } = req.body;
    if (!user_id || !recipe_id || !date) return res.status(400).json({ error: 'user_id, recipe_id und date sind erforderlich' });
    const id = uuidv4();
    await dbAdapter.run('INSERT INTO planner_entries (id, user_id, recipe_id, date) VALUES (?, ?, ?, ?)', [id, user_id, recipe_id, date]);
    res.json(await dbAdapter.queryOne('SELECT pe.*, r.title as recipe_title, r.category as recipe_category, r.image as recipe_image FROM planner_entries pe JOIN recipes r ON pe.recipe_id = r.id WHERE pe.id = ?', [id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/planner/:id', async (req, res) => {
  try {
    await dbAdapter.run('DELETE FROM planner_entries WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/planner/ingredients', async (req, res) => {
  try {
    const { user_id, start_date, end_date } = req.query;
    if (!user_id || !start_date || !end_date) return res.status(400).json({ error: 'Alle Parameter erforderlich' });
    res.json(await dbAdapter.queryAll(
      'SELECT DISTINCT r.id, r.title, r.ingredients FROM planner_entries pe JOIN recipes r ON pe.recipe_id = r.id WHERE pe.user_id = ? AND pe.date >= ? AND pe.date <= ?',
      [user_id, start_date, end_date]
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Export/Import ---
app.get('/api/export', async (req, res) => {
  try {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'user_id erforderlich' });
    res.json({ version: '1.0', exported_at: new Date().toISOString(), recipes: await dbAdapter.queryAll('SELECT * FROM recipes WHERE user_id = ?', [userId]) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/import', async (req, res) => {
  try {
    const { user_id, recipes } = req.body;
    if (!user_id || !recipes) return res.status(400).json({ error: 'user_id und recipes sind erforderlich' });
    let count = 0;
    for (const r of recipes) {
      await dbAdapter.run(
        'INSERT INTO recipes (id, user_id, title, category, portions, tags, source_url, ingredients, preparation, image, notes, is_favorite) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [uuidv4(), user_id, r.title || 'Unbenannt', r.category || '', r.portions || null,
         typeof r.tags === 'string' ? r.tags : JSON.stringify(r.tags || []),
         r.source_url || '', r.ingredients || '', r.preparation || '', r.image || '', r.notes || '', r.is_favorite ? 1 : 0]
      );
      count++;
    }
    res.json({ success: true, imported: count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ START ============
async function start() {
  if (process.env.DATABASE_URL) {
    console.log('🔌 Verwende PostgreSQL...');
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    dbAdapter = createPgAdapter(pool);
  } else {
    console.log('📁 Verwende SQLite (lokal)...');
    dbAdapter = createSqliteAdapter();
  }

  await dbAdapter.init();

  app.listen(PORT, () => {
    console.log(`🍳 Evas Rezeptesammlung läuft auf http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Start fehlgeschlagen:', err);
  process.exit(1);
});
