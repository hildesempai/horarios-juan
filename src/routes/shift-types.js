const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.use(requireAuth);

// GET /api/shift-types
router.get('/', (req, res) => {
  const db = getDb();
  const shifts = db.prepare('SELECT * FROM shift_types ORDER BY sort_order').all();
  res.json(shifts);
});

// POST /api/shift-types
router.post('/', (req, res) => {
  const { name, start_time, end_time, required_staff, triggers_next_day_off, sort_order } = req.body;
  if (!name || !start_time || !end_time)
    return res.status(400).json({ error: 'name, start_time y end_time son requeridos' });
  const db = getDb();
  try {
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM shift_types').get().m || 0;
    const result = db.prepare(`
      INSERT INTO shift_types (name, start_time, end_time, required_staff, triggers_next_day_off, sort_order, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(name, start_time, end_time, Number(required_staff) || 1, triggers_next_day_off ? 1 : 0, sort_order || maxOrder + 1);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Ya existe un turno con ese nombre' });
    throw e;
  }
});

// PUT /api/shift-types/:id
router.put('/:id', (req, res) => {
  const { name, start_time, end_time, required_staff, triggers_next_day_off, sort_order, active } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE shift_types SET name=?, start_time=?, end_time=?, required_staff=?,
    triggers_next_day_off=?, sort_order=?, active=? WHERE id=?
  `).run(name, start_time, end_time, Number(required_staff) || 1,
    triggers_next_day_off ? 1 : 0, sort_order, active !== undefined ? (active ? 1 : 0) : 1,
    req.params.id);
  res.json({ ok: true });
});

// DELETE /api/shift-types/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const used = db.prepare('SELECT COUNT(*) as c FROM schedule_entries WHERE shift_type_id=?').get(req.params.id);
  if (used.c > 0) return res.status(409).json({ error: 'Turno en uso en horarios existentes' });
  db.prepare('DELETE FROM shift_types WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
