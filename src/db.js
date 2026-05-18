/**
 * db.js — SQLite singleton usando node:sqlite (built-in desde Node 22.5+)
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');

// Ruta absoluta desde la raíz del proyecto (server.js está en la raíz)
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let _db = null;

function getDb() {
  if (!_db) {
    _db = new DatabaseSync(path.join(dataDir, 'horarios.db'));
    _db.exec('PRAGMA journal_mode = WAL');
    _db.exec('PRAGMA foreign_keys = ON');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS employee_notes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        note_date   TEXT NOT NULL,
        content     TEXT NOT NULL,
        tag         TEXT NOT NULL,
        created_at  TEXT DEFAULT (datetime('now'))
      );
    `);
  }
  return _db;
}

module.exports = { getDb };
