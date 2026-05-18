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

// DELETE /api/employees/:id/permanent (hard delete)
router.delete('/:id/permanent', (req, res) => {
  const db = getDb();
  const entriesCount = db.prepare('SELECT COUNT(*) as count FROM schedule_entries WHERE employee_id = ?').get(req.params.id).count;
  const blocksCount = db.prepare('SELECT COUNT(*) as count FROM off_day_blocks WHERE employee_id = ?').get(req.params.id).count;
  
  if (entriesCount > 0 || blocksCount > 0) {
    return res.status(400).json({
      error: 'No se puede eliminar permanentemente a este empleado porque tiene historial de turnos o días libres en los cronogramas. Si ya no trabaja aquí, desactívalo (Inactivo).'
    });
  }
  
  db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/employees/:id/notes
router.get('/:id/notes', (req, res) => {
  const db = getDb();
  const notes = db.prepare(`
    SELECT * FROM employee_notes
    WHERE employee_id = ?
    ORDER BY note_date DESC, created_at DESC
  `).all(req.params.id);
  res.json(notes);
});

// POST /api/employees/:id/notes
router.post('/:id/notes', (req, res) => {
  const { note_date, content, tag } = req.body;
  if (!note_date || !content || !tag) {
    return res.status(400).json({ error: 'note_date, content y tag son requeridos' });
  }
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO employee_notes (employee_id, note_date, content, tag)
    VALUES (?, ?, ?, ?)
  `).run(req.params.id, note_date, content, tag);
  res.status(201).json({ id: result.lastInsertRowid });
});

// DELETE /api/employees/notes/:noteId
router.delete('/notes/:noteId', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM employee_notes WHERE id = ?').run(req.params.noteId);
  res.json({ ok: true });
});

module.exports = router;
