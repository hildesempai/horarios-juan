const express = require('express');
const bcrypt  = require('bcrypt');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const router  = express.Router();

router.use(requireAuth);

// GET /api/settings (returns all except admin_pass)
router.get('/', (req, res) => {
  const db = getDb();
  const all = db.prepare("SELECT key, value FROM settings WHERE key != 'admin_pass'").all();
  const result = {};
  all.forEach(r => { result[r.key] = r.value; });
  res.json(result);
});

// PUT /api/settings
router.put('/', (req, res) => {
  const db = getDb();
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const allowed = ['smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from','period_days','shifts_per_week'];

  const update = db.transaction((body) => {
    for (const key of allowed) {
      if (body[key] !== undefined) upsert.run(key, body[key]);
    }
  });
  update(req.body);
  res.json({ ok: true });
});

// PUT /api/settings/password
router.put('/password', (req, res) => {
  const { current_pass, new_pass } = req.body;
  if (!current_pass || !new_pass || new_pass.length < 4)
    return res.status(400).json({ error: 'Contraseña nueva debe tener al menos 4 caracteres' });

  const db = getDb();
  const stored = db.prepare("SELECT value FROM settings WHERE key='admin_pass'").get();
  const valid  = bcrypt.compareSync(current_pass, stored.value);
  if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

  const newHash = bcrypt.hashSync(new_pass, 10);
  db.prepare("UPDATE settings SET value=? WHERE key='admin_pass'").run(newHash);
  res.json({ ok: true });
});

// POST /api/settings/test-smtp
router.post('/test-smtp', async (req, res) => {
  const nodemailer = require('nodemailer');
  const db = getDb();
  const s = {};
  db.prepare("SELECT key, value FROM settings WHERE key LIKE 'smtp%'").all()
    .forEach(r => { s[r.key] = r.value; });

  if (!s.smtp_host || !s.smtp_user)
    return res.status(400).json({ error: 'SMTP no configurado' });

  try {
    const transporter = nodemailer.createTransporter({
      host: s.smtp_host, port: Number(s.smtp_port) || 587,
      secure: false,
      auth: { user: s.smtp_user, pass: s.smtp_pass }
    });
    await transporter.verify();
    res.json({ ok: true, message: 'Conexión SMTP exitosa' });
  } catch (e) {
    res.status(400).json({ error: `Error SMTP: ${e.message}` });
  }
});

module.exports = router;
