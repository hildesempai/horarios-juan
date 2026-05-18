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
  }
  return _db;
}

module.exports = { getDb };
