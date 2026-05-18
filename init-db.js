/**
 * init-db.js — Inicializa la base de datos con schema y datos seed.
 * Usa node:sqlite (built-in desde Node 22.5+, incluido en Node 24).
 */
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcrypt');
const path   = require('path');
const fs     = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new DatabaseSync(path.join(dataDir, 'horarios.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

console.log('🗄️  Inicializando base de datos...');

// ── Schema ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS employee_types (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL UNIQUE,
    off_days         INTEGER NOT NULL DEFAULT 2,
    consecutive_off  INTEGER NOT NULL DEFAULT 1,
    description      TEXT,
    created_at       TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS employees (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    abbreviation  TEXT NOT NULL UNIQUE,
    type_id       INTEGER REFERENCES employee_types(id),
    email         TEXT,
    color         TEXT NOT NULL DEFAULT '#6366f1',
    is_substitute INTEGER NOT NULL DEFAULT 0,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS shift_types (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    name                  TEXT NOT NULL UNIQUE,
    start_time            TEXT NOT NULL,
    end_time              TEXT NOT NULL,
    required_staff        INTEGER NOT NULL DEFAULT 2,
    triggers_next_day_off INTEGER NOT NULL DEFAULT 0,
    sort_order            INTEGER NOT NULL DEFAULT 0,
    active                INTEGER NOT NULL DEFAULT 1,
    created_at            TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS schedule_periods (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    start_date  TEXT NOT NULL,
    end_date    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'draft',
    notes       TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS schedule_entries (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id           INTEGER NOT NULL REFERENCES schedule_periods(id) ON DELETE CASCADE,
    entry_date          TEXT NOT NULL,
    shift_type_id       INTEGER NOT NULL REFERENCES shift_types(id),
    employee_id         INTEGER NOT NULL REFERENCES employees(id),
    position            INTEGER NOT NULL DEFAULT 1,
    is_locked           INTEGER NOT NULL DEFAULT 0,
    is_day_off          INTEGER NOT NULL DEFAULT 0,
    is_rest_after_night INTEGER NOT NULL DEFAULT 0,
    UNIQUE(period_id, entry_date, shift_type_id, position)
  );

  CREATE TABLE IF NOT EXISTS off_day_blocks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id    INTEGER NOT NULL REFERENCES schedule_periods(id) ON DELETE CASCADE,
    employee_id  INTEGER NOT NULL REFERENCES employees(id),
    start_date   TEXT NOT NULL,
    end_date     TEXT NOT NULL,
    block_type   TEXT NOT NULL DEFAULT 'regular'
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ── Seed ────────────────────────────────────────────────────────────────────
// Tipos de empleado
db.prepare("INSERT OR IGNORE INTO employee_types (name, off_days, consecutive_off, description) VALUES (?, ?, ?, ?)")
  .run('Local',   2, 1, 'Empleado residente, 2 días libres por período');
db.prepare("INSERT OR IGNORE INTO employee_types (name, off_days, consecutive_off, description) VALUES (?, ?, ?, ?)")
  .run('Foráneo', 3, 1, 'Empleado externo, 3 días libres por período');

const localType  = db.prepare('SELECT id FROM employee_types WHERE name = ?').get('Local');
const foraneType = db.prepare('SELECT id FROM employee_types WHERE name = ?').get('Foráneo');

// Empleados
const insertEmp = db.prepare('INSERT OR IGNORE INTO employees (name, abbreviation, type_id, color, is_substitute, active) VALUES (?, ?, ?, ?, 0, 1)');
insertEmp.run('Héctor',   'HE',  localType.id,  '#10b981');
insertEmp.run('Juan',     'JU',  localType.id,  '#f59e0b');
insertEmp.run('Marcela',  'MAR', localType.id,  '#a855f7');
insertEmp.run('Diego',    'DIE', foraneType.id, '#3b82f6');
insertEmp.run('Milagros', 'MI',  foraneType.id, '#ec4899');

// Turnos
const insertShift = db.prepare('INSERT OR IGNORE INTO shift_types (name, start_time, end_time, required_staff, triggers_next_day_off, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
insertShift.run('Mañana', '08:00', '14:00', 2, 0, 1);
insertShift.run('Tarde',  '14:00', '20:00', 2, 0, 2);
insertShift.run('Noche',  '20:00', '08:00', 1, 1, 3);

// Settings
const ins = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
const adminHash = bcrypt.hashSync('admin', 10);
ins.run('admin_user',      'admin');
ins.run('admin_pass',      adminHash);
ins.run('period_days',     '15');
ins.run('shifts_per_week', '7');
ins.run('smtp_host', '');
ins.run('smtp_port', '587');
ins.run('smtp_user', '');
ins.run('smtp_pass', '');
ins.run('smtp_from', '');

db.close();
console.log('✅ Base de datos lista en data/horarios.db');
console.log('   Empleados: Héctor (HE), Juan (JU), Marcela (MAR), Diego (DIE), Milagros (MI)');
console.log('   Turnos:    Mañana 08-14 · Tarde 14-20 · Noche 20-08');
console.log('   Admin:     usuario=admin  contraseña=admin\n');
