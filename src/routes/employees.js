const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.use(requireAuth);

// GET /api/employees?include_substitutes=true
router.get('/', (req, res) => {
  const db = getDb();
  const includeSubstitutes = req.query.include_substitutes === 'true';
  const query = includeSubstitutes
    ? `SELECT e.*, et.name as type_name, et.off_days, et.consecutive_off
       FROM employees e LEFT JOIN employee_types et ON e.type_id = et.id
       ORDER BY e.is_substitute, e.name`
    : `SELECT e.*, et.name as type_name, et.off_days, et.consecutive_off
       FROM employees e LEFT JOIN employee_types et ON e.type_id = et.id
       WHERE e.is_substitute = 0
       ORDER BY e.name`;
  res.json(db.prepare(query).all());
});

// GET /api/employees/active  (solo activos, para el generador)
router.get('/active', (req, res) => {
  const db = getDb();
  const employees = db.prepare(`
    SELECT e.*, et.name as type_name, et.off_days, et.consecutive_off
    FROM employees e
    LEFT JOIN employee_types et ON e.type_id = et.id
    WHERE e.active = 1 AND e.is_substitute = 0
    ORDER BY e.name
  `).all();
  res.json(employees);
});

// POST /api/employees
router.post('/', (req, res) => {
  const { name, abbreviation, type_id, email, color, is_substitute } = req.body;
  if (!name || !abbreviation)
    return res.status(400).json({ error: 'name y abbreviation son requeridos' });
  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO employees (name, abbreviation, type_id, email, color, is_substitute, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(
      name.trim(),
      abbreviation.trim().toUpperCase(),
      type_id || null,
      email || null,
      color || '#6366f1',
      is_substitute ? 1 : 0
    );
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Abreviación ya existe' });
    throw e;
  }
});

// PUT /api/employees/:id
router.put('/:id', (req, res) => {
  const { name, abbreviation, type_id, email, color, is_substitute, active } = req.body;
  const db = getDb();
  try {
    db.prepare(`
      UPDATE employees SET name=?, abbreviation=?, type_id=?, email=?, color=?, is_substitute=?, active=?
      WHERE id=?
    `).run(
      name.trim(),
      abbreviation.trim().toUpperCase(),
      type_id || null,
      email || null,
      color || '#6366f1',
      is_substitute ? 1 : 0,
      active !== undefined ? (active ? 1 : 0) : 1,
      req.params.id
    );
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Abreviación ya existe' });
    throw e;
  }
});

// DELETE /api/employees/:id (soft delete)
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE employees SET active = 0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
