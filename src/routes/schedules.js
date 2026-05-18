const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { generateSchedule } = require('../engine/scheduler');
const router = express.Router();

router.use(requireAuth);

// GET /api/schedules — listar todos los períodos
router.get('/', (req, res) => {
  const db = getDb();
  const periods = db.prepare(`
    SELECT sp.*,
      (SELECT COUNT(*) FROM schedule_entries WHERE period_id = sp.id) as entry_count
    FROM schedule_periods sp
    ORDER BY sp.start_date DESC
  `).all();
  res.json(periods);
});

// GET /api/schedules/:id — detalle completo de un período
router.get('/:id', (req, res) => {
  const db = getDb();
  const period = db.prepare('SELECT * FROM schedule_periods WHERE id=?').get(req.params.id);
  if (!period) return res.status(404).json({ error: 'Período no encontrado' });

  const entries = db.prepare(`
    SELECT se.*, e.name as emp_name, e.abbreviation, e.color,
           st.name as shift_name, st.start_time, st.end_time, st.sort_order,
           st.triggers_next_day_off
    FROM schedule_entries se
    JOIN employees e ON se.employee_id = e.id
    JOIN shift_types st ON se.shift_type_id = st.id
    WHERE se.period_id = ?
    ORDER BY se.entry_date, st.sort_order, se.position
  `).all(req.params.id);

  const offBlocks = db.prepare(`
    SELECT ob.*, e.name as emp_name, e.abbreviation, e.color
    FROM off_day_blocks ob
    JOIN employees e ON ob.employee_id = e.id
    WHERE ob.period_id = ?
    ORDER BY ob.start_date
  `).all(req.params.id);

  res.json({ period, entries, offBlocks });
});

// POST /api/schedules/generate — generar nuevo período automáticamente
router.post('/generate', (req, res) => {
  const { start_date, end_date } = req.body;
  if (!start_date || !end_date)
    return res.status(400).json({ error: 'start_date y end_date son requeridos' });

  const db = getDb();

  // Verificar solapamiento con períodos existentes
  const overlap = db.prepare(`
    SELECT id FROM schedule_periods
    WHERE NOT (end_date < ? OR start_date > ?)
  `).get(start_date, end_date);
  if (overlap) return res.status(409).json({ error: 'Ya existe un período que solapa con esas fechas' });

  // Cargar empleados activos con su tipo
  const employees = db.prepare(`
    SELECT e.*, et.off_days, et.consecutive_off
    FROM employees e
    JOIN employee_types et ON e.type_id = et.id
    WHERE e.active = 1 AND e.is_substitute = 0
    ORDER BY e.id
  `).all();

  if (employees.length === 0)
    return res.status(400).json({ error: 'No hay empleados activos' });

  const shiftTypes = db.prepare(`
    SELECT * FROM shift_types WHERE active = 1 ORDER BY sort_order
  `).all();

  if (shiftTypes.length === 0)
    return res.status(400).json({ error: 'No hay tipos de turno configurados' });

  // Ejecutar algoritmo
  const { entries, offBlocks, warnings } = generateSchedule({
    startDate: start_date,
    endDate:   end_date,
    employees,
    shiftTypes,
    lockedEntries: []
  });

  // Persistir con transacción manual (node:sqlite no tiene db.transaction())
  let periodId;
  try {
    db.exec('BEGIN');
    const periodResult = db.prepare(`
      INSERT INTO schedule_periods (start_date, end_date, status)
      VALUES (?, ?, 'draft')
    `).run(start_date, end_date);
    periodId = periodResult.lastInsertRowid;

    const insertEntry = db.prepare(`
      INSERT OR IGNORE INTO schedule_entries
        (period_id, entry_date, shift_type_id, employee_id, position, is_locked, is_day_off, is_rest_after_night)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const e of entries) {
      insertEntry.run(periodId, e.entry_date, e.shift_type_id, e.employee_id,
        e.position, e.is_locked || 0, e.is_day_off || 0, e.is_rest_after_night || 0);
    }

    const insertBlock = db.prepare(`
      INSERT INTO off_day_blocks (period_id, employee_id, start_date, end_date, block_type)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const b of offBlocks) {
      insertBlock.run(periodId, b.employee_id, b.start_date, b.end_date, b.block_type);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: err.message });
  }
  res.status(201).json({ id: periodId, warnings });
});

// PUT /api/schedules/:id/entry — mover un empleado en una celda (drag & drop)
router.put('/:id/entry', (req, res) => {
  const { entry_date, shift_type_id, position, employee_id, is_locked } = req.body;
  const db = getDb();

  // Verificar que el período existe
  const period = db.prepare('SELECT * FROM schedule_periods WHERE id=?').get(req.params.id);
  if (!period) return res.status(404).json({ error: 'Período no encontrado' });

  // Upsert de la entrada
  db.prepare(`
    INSERT INTO schedule_entries (period_id, entry_date, shift_type_id, employee_id, position, is_locked)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(period_id, entry_date, shift_type_id, position) DO UPDATE SET
      employee_id = excluded.employee_id,
      is_locked   = excluded.is_locked,
      is_day_off  = 0
  `).run(req.params.id, entry_date, shift_type_id, employee_id, position, is_locked ? 1 : 0);

  // Actualizar timestamp del período
  db.prepare("UPDATE schedule_periods SET updated_at=datetime('now') WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// PUT /api/schedules/:id/lock — bloquear/desbloquear una celda
router.put('/:id/lock', (req, res) => {
  const { entry_date, shift_type_id, position, is_locked } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE schedule_entries SET is_locked=?
    WHERE period_id=? AND entry_date=? AND shift_type_id=? AND position=?
  `).run(is_locked ? 1 : 0, req.params.id, entry_date, shift_type_id, position);
  res.json({ ok: true });
});

// POST /api/schedules/:id/rebalance — rebalancear respetando celdas locked
router.post('/:id/rebalance', (req, res) => {
  const db = getDb();
  const period = db.prepare('SELECT * FROM schedule_periods WHERE id=?').get(req.params.id);
  if (!period) return res.status(404).json({ error: 'Período no encontrado' });

  const employees = db.prepare(`
    SELECT e.*, et.off_days, et.consecutive_off
    FROM employees e JOIN employee_types et ON e.type_id = et.id
    WHERE e.active = 1 AND e.is_substitute = 0
  `).all();

  const shiftTypes = db.prepare('SELECT * FROM shift_types WHERE active=1 ORDER BY sort_order').all();

  // Obtener entradas locked (el motor respeta estas)
  const lockedEntries = db.prepare(`
    SELECT entry_date, shift_type_id, employee_id, position
    FROM schedule_entries
    WHERE period_id=? AND is_locked=1
  `).all(req.params.id);

  // Obtener TODAS las entradas actuales para detectar patrones 24h
  // (aunque no estén locked, si alguien hizo 24h no locked, también debe librar)
  const allCurrentEntries = db.prepare(`
    SELECT entry_date, shift_type_id, employee_id, position, is_locked
    FROM schedule_entries
    WHERE period_id=?
  `).all(req.params.id);

  // Detectar empleados con patrón 24h en entradas no-locked y forzar locked
  // para que el motor los respete al generar el día siguiente libre
  const shiftCount = {};
  for (const e of allCurrentEntries) {
    const key = `${e.entry_date}|${e.employee_id}`;
    if (!shiftCount[key]) shiftCount[key] = [];
    shiftCount[key].push(e.shift_type_id);
  }
  // Si alguien tiene los 3 turnos ese día (24h), añadir esas entradas a locked
  // para que el scheduler detecte el patrón y bloquee el día siguiente
  const extraLocked = [];
  for (const [key, shiftIds] of Object.entries(shiftCount)) {
    if (shiftIds.length >= shiftTypes.length) {
      const [date, empIdStr] = key.split('|');
      const empId = Number(empIdStr);
      for (const e of allCurrentEntries.filter(
        e => e.entry_date === date && e.employee_id === empId && !e.is_locked
      )) {
        extraLocked.push(e);
      }
    }
  }
  const mergedLocked = [...lockedEntries, ...extraLocked];

  const { entries, offBlocks, warnings } = generateSchedule({
    startDate: period.start_date,
    endDate:   period.end_date,
    employees,
    shiftTypes,
    lockedEntries: mergedLocked
  });

  // Reemplazar entradas no-locked con transacción manual
  try {
    db.exec('BEGIN');
    db.prepare('DELETE FROM schedule_entries WHERE period_id=? AND is_locked=0').run(req.params.id);
    db.prepare('DELETE FROM off_day_blocks WHERE period_id=? AND block_type != ?').run(req.params.id, 'manual');

    const insertEntry = db.prepare(`
      INSERT OR IGNORE INTO schedule_entries
        (period_id, entry_date, shift_type_id, employee_id, position, is_locked, is_day_off, is_rest_after_night)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const e of entries.filter(e => !e.is_locked)) {
      insertEntry.run(req.params.id, e.entry_date, e.shift_type_id, e.employee_id,
        e.position, 0, e.is_day_off || 0, e.is_rest_after_night || 0);
    }

    const insertBlock = db.prepare(`
      INSERT INTO off_day_blocks (period_id, employee_id, start_date, end_date, block_type)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const b of offBlocks) {
      insertBlock.run(req.params.id, b.employee_id, b.start_date, b.end_date, b.block_type);
    }
    db.prepare("UPDATE schedule_periods SET updated_at=datetime('now') WHERE id=?").run(req.params.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: err.message });
  }
  res.json({ ok: true, warnings });
});

// PUT /api/schedules/:id/status — cambiar estado draft/published/archived
router.put('/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['draft','published','archived'].includes(status))
    return res.status(400).json({ error: 'Status inválido' });
  const db = getDb();
  db.prepare("UPDATE schedule_periods SET status=?, updated_at=datetime('now') WHERE id=?")
    .run(status, req.params.id);
  res.json({ ok: true });
});

// PUT /api/schedules/:id/notes
router.put('/:id/notes', (req, res) => {
  const { notes } = req.body;
  const db = getDb();
  db.prepare("UPDATE schedule_periods SET notes=?, updated_at=datetime('now') WHERE id=?")
    .run(notes || '', req.params.id);
  res.json({ ok: true });
});

// DELETE /api/schedules/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM schedule_periods WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/schedules/:id/notify — enviar emails a empleados
router.post('/:id/notify', async (req, res) => {
  const nodemailer = require('nodemailer');
  const db = getDb();

  const smtpSettings = {};
  db.prepare("SELECT key, value FROM settings WHERE key LIKE 'smtp%'").all()
    .forEach(r => { smtpSettings[r.key] = r.value; });

  if (!smtpSettings.smtp_host || !smtpSettings.smtp_user)
    return res.status(400).json({ error: 'SMTP no configurado en Configuración' });

  const period = db.prepare('SELECT * FROM schedule_periods WHERE id=?').get(req.params.id);
  if (!period) return res.status(404).json({ error: 'Período no encontrado' });

  const employees = db.prepare(`
    SELECT DISTINCT e.id, e.name, e.email, e.color, e.abbreviation
    FROM schedule_entries se
    JOIN employees e ON se.employee_id = e.id
    WHERE se.period_id = ? AND e.email IS NOT NULL AND e.email != ''
  `).all(req.params.id);

  const transporter = nodemailer.createTransporter({
    host: smtpSettings.smtp_host,
    port: Number(smtpSettings.smtp_port) || 587,
    secure: false,
    auth: { user: smtpSettings.smtp_user, pass: smtpSettings.smtp_pass }
  });

  const sent = [], failed = [];

  for (const emp of employees) {
    const empEntries = db.prepare(`
      SELECT se.entry_date, st.name as shift_name, st.start_time, st.end_time
      FROM schedule_entries se
      JOIN shift_types st ON se.shift_type_id = st.id
      WHERE se.period_id = ? AND se.employee_id = ?
      ORDER BY se.entry_date, st.sort_order
    `).all(req.params.id, emp.id);

    const rows = empEntries.map(e =>
      `<tr><td>${e.entry_date}</td><td>${e.shift_name}</td><td>${e.start_time} – ${e.end_time}</td></tr>`
    ).join('');

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:${emp.color}">Horario: ${emp.name}</h2>
        <p>Período: <strong>${period.start_date} → ${period.end_date}</strong></p>
        <table border="1" cellpadding="8" style="border-collapse:collapse;width:100%">
          <thead style="background:#f3f4f6">
            <tr><th>Fecha</th><th>Turno</th><th>Horario</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${period.notes ? `<p><em>Notas: ${period.notes}</em></p>` : ''}
      </div>
    `;

    try {
      await transporter.sendMail({
        from: smtpSettings.smtp_from || smtpSettings.smtp_user,
        to: emp.email,
        subject: `Tu horario ${period.start_date} → ${period.end_date}`,
        html
      });
      sent.push(emp.name);
    } catch (e) {
      failed.push({ name: emp.name, error: e.message });
    }
  }

  res.json({ sent, failed });
});

module.exports = router;
