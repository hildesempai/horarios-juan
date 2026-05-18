const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.use(requireAuth);

// GET /api/employee-types
router.get('/', (req, res) => {
  const db = getDb();
  const types = db.prepare('SELECT * FROM employee_types ORDER BY id').all();
  res.json(types);
});

// POST /api/employee-types
router.post('/', (req, res) => {
  const { name, off_days, consecutive_off, description } = req.body;
  if (!name || off_days == null)
    return res.status(400).json({ error: 'name y off_days son requeridos' });
  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO employee_types (name, off_days, consecutive_off, description)
      VALUES (?, ?, ?, ?)
    `).run(name, Number(off_days), consecutive_off ? 1 : 0, description || '');
    res.status(201).json({ id: result.lastInsertRowid, name, off_days, consecutive_off, description });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Ya existe un tipo con ese nombre' });
    throw e;
  }
});

// PUT /api/employee-types/:id
router.put('/:id', (req, res) => {
  const { name, off_days, consecutive_off, description } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE employee_types SET name=?, off_days=?, consecutive_off=?, description=?
    WHERE id=?
  `).run(name, Number(off_days), consecutive_off ? 1 : 0, description || '', req.params.id);
  res.json({ ok: true });
});

// DELETE /api/employee-types/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const used = db.prepare('SELECT COUNT(*) as c FROM employees WHERE type_id=?').get(req.params.id);
  if (used.c > 0) return res.status(409).json({ error: 'Tipo en uso por empleados activos' });
  db.prepare('DELETE FROM employee_types WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
