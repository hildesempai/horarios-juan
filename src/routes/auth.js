const express = require('express');
const bcrypt  = require('bcrypt');
const { getDb } = require('../db');
const router  = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

  const db = getDb();
  const storedUser = db.prepare("SELECT value FROM settings WHERE key = 'admin_user'").get();
  const storedPass = db.prepare("SELECT value FROM settings WHERE key = 'admin_pass'").get();

  if (!storedUser || !storedPass)
    return res.status(500).json({ error: 'Configuración de admin no encontrada' });

  if (username !== storedUser.value)
    return res.status(401).json({ error: 'Credenciales incorrectas' });

  const valid = bcrypt.compareSync(password, storedPass.value);
  if (!valid)
    return res.status(401).json({ error: 'Credenciales incorrectas' });

  req.session.authenticated = true;
  req.session.username = username;
  res.json({ ok: true, username });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /api/auth/check
router.get('/check', (req, res) => {
  if (req.session && req.session.authenticated)
    return res.json({ authenticated: true, username: req.session.username });
  res.json({ authenticated: false });
});

module.exports = router;
