/* views/schedule-editor.js — Editor principal de horarios con Drag & Drop */

let _scheduleState = {
  periods: [],
  currentPeriod: null,
  detail: null,
  employees: [],
  shiftTypes: [],
  currentWeek: 0,  // 0 = semana 1, 1 = semana 2
  draggingEmpId: null
};

async function renderScheduleEditor(container) {
  container.innerHTML = `<div class="page"><div class="spinner" style="margin:4rem auto;display:block"></div></div>`;

  try {
    const [periods, employees, shiftTypes] = await Promise.all([
      API.getSchedules(),
      API.getActiveEmployees(),
      API.getShiftTypes()
    ]);

    _scheduleState.periods    = periods;
    _scheduleState.employees  = employees;
    _scheduleState.shiftTypes = shiftTypes.filter(s => s.active);

    if (periods.length === 0) {
      _renderScheduleEmpty(container);
      return;
    }

    if (!_scheduleState.currentPeriod) {
      _scheduleState.currentPeriod = periods[0];
    }

    await _loadAndRenderPeriod(container, _scheduleState.currentPeriod.id);
  } catch(e) {
    container.innerHTML = `<div class="page"><div class="alert alert-danger">❌ Error cargando horarios: ${e.message}</div></div>`;
  }
}

function _renderScheduleEmpty(container) {
  const { start, end } = defaultPeriodDates();
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div><div class="section-title">Horarios</div><div class="section-subtitle">Editor de turnos</div></div>
      </div>
      <div class="card" style="text-align:center;padding:var(--sp-12)">
        <div style="font-size:3rem;margin-bottom:var(--sp-4)">📅</div>
        <div class="card-title" style="margin-bottom:var(--sp-2)">Sin períodos creados</div>
        <p style="color:var(--text-300);margin-bottom:var(--sp-6)">Genera tu primer horario automáticamente</p>
        <button id="btn-first-generate" class="btn btn-primary btn-lg">✨ Generar primer período</button>
      </div>
    </div>`;
  document.getElementById('btn-first-generate').onclick = () => _showGenerateModal(container);
}

async function _loadAndRenderPeriod(container, periodId) {
  const detail = await API.getSchedule(periodId);
  _scheduleState.detail = detail;
  _scheduleState.currentPeriod = detail.period;
  _renderFull(container);
}

function _renderFull(container) {
  const { periods, currentPeriod, detail, employees, shiftTypes, currentWeek } = _scheduleState;
  if (!detail) return;

  const { period, entries, offBlocks } = detail;
  const periodDates = _getPeriodDates(period.start_date, period.end_date);
  const totalWeeks  = Math.ceil(periodDates.length / 7);

  // Semana actual (máximo 7 días)
  const weekDates = periodDates.slice(currentWeek * 7, currentWeek * 7 + 7);

  // ── Período pills ──
  const periodPills = periods.map(p => `
    <button class="period-pill ${p.id === currentPeriod.id ? 'active' : ''}"
      onclick="_selectPeriod(${p.id})">
      ${formatDate(p.start_date)} → ${formatDate(p.end_date)}
      <span class="badge badge-${p.status === 'published' ? 'success' : p.status === 'draft' ? 'warning' : 'muted'}" style="margin-left:4px">
        ${p.status === 'published' ? '✓' : p.status === 'draft' ? '✏️' : '📦'}
      </span>
    </button>`).join('');

  // ── Week tabs ──
  const weekTabs = Array.from({length: totalWeeks}, (_, i) => `
    <button class="week-tab ${i === currentWeek ? 'active' : ''}"
      onclick="_setWeek(${i})">
      Semana ${i+1}<br>
      <span style="font-size:10px;font-weight:400">${formatDate(periodDates[i*7])}${periodDates[i*7+6] ? ` - ${formatDate(periodDates[i*7+6])}` : ''}</span>
    </button>`).join('');

  // ── Grid ──
  const gridHtml = _buildGrid(weekDates, entries, offBlocks, shiftTypes, employees);

  // ── Employee palette ──
  const palette = employees.map(e => {
    const bg  = hexToRgba(e.color, 0.15);
    const bdr = hexToRgba(e.color, 0.4);
    return `<div class="palette-chip" style="background:${bg};border-color:${bdr};color:${e.color}"
      draggable="true"
      ondragstart="_onPaletteDragStart(event, ${e.id})"
      data-emp-id="${e.id}">
      ${e.abbreviation}
      <span style="font-size:10px;font-weight:400;opacity:.7">${e.name.split(' ')[0]}</span>
    </div>`;
  }).join('');

  // ── Warnings ──
  let warningsHtml = '';

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="section-title">Horarios</div>
          <div class="section-subtitle">Editor visual de turnos — Drag & Drop</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="_showGenerateModal(document.getElementById('view-container'))">
            ➕ Nuevo período
          </button>
          <button class="btn btn-warning btn-sm" onclick="_rebalance()">
            🔄 Rebalancear
          </button>
          <button class="btn btn-success btn-sm" onclick="_exportPDF()">
            📥 Exportar PDF
          </button>
          <button class="btn btn-secondary btn-sm" onclick="_sendNotifications()">
            📧 Notificar
          </button>
          <button class="btn btn-${currentPeriod.status === 'draft' ? 'primary' : 'ghost'} btn-sm"
            onclick="_toggleStatus()">
            ${currentPeriod.status === 'draft' ? '✅ Publicar' : '📝 Volver a borrador'}
          </button>
        </div>
      </div>

      ${warningsHtml}

      <!-- Período selector -->
      <div class="period-selector">
        <span style="font-size:var(--text-xs);font-weight:700;color:var(--text-400);white-space:nowrap">PERÍODO:</span>
        <div class="period-list">${periodPills}</div>
        <button class="btn btn-danger btn-sm" onclick="_deletePeriod()">🗑️</button>
      </div>

      <!-- Week tabs -->
      <div class="week-tabs">${weekTabs}</div>

      <!-- Notas -->
      <div class="notes-bar" style="margin-bottom:var(--sp-3)">
        <label>📝 Notas:</label>
        <input id="period-notes" type="text" placeholder="Ej: Sale Mili el Lunes, entra el Jueves..."
          value="${period.notes || ''}"
          onblur="_saveNotes(this.value)" />
      </div>

      <!-- Grid -->
      <div class="schedule-grid-outer">${gridHtml}</div>

      <!-- Employee palette -->
      <div class="employee-palette" style="margin-top:var(--sp-4)">
        <div class="palette-title">Empleados — arrastra al grid</div>
        <div class="palette-chips">${palette}</div>
      </div>
    </div>`;

  // ── Setup drag & drop on cells ──
  _setupCellDnD();
}

function _buildGrid(dates, entries, offBlocks, shiftTypes, employees) {
  const empMap = new Map(employees.map(e => [e.id, e]));

  // Headers
  const dateHeaders = dates.map(d => `
    <th class="day-header ${isToday(d) ? 'today' : ''}">
      <div class="day-name">${getDayName(d)}</div>
      <div class="day-date">${formatDate(d)}</div>
    </th>`).join('');

  // Shift rows
  const shiftRows = shiftTypes.map(shift => {
    const shiftClass = shift.sort_order === 1 ? 'morning' : shift.sort_order === 2 ? 'afternoon' : 'night';
    const shiftIcon  = shift.sort_order === 1 ? '🌅' : shift.sort_order === 2 ? '☀️' : '🌙';

    const cells = dates.map(date => {
      const cellEntries = entries.filter(
        e => e.entry_date === date && e.shift_type_id === shift.id
      ).sort((a,b) => a.position - b.position);

      const tokens = cellEntries.map(e => {
        const emp = empMap.get(e.employee_id);
        if (!emp) return '';
        const bg  = hexToRgba(emp.color, 0.2);
        const bdr = hexToRgba(emp.color, 0.5);
        return `<div class="emp-token ${e.is_locked ? 'locked' : ''}"
          style="background:${bg};border-color:${bdr};color:${emp.color}"
          data-emp-id="${emp.id}"
          data-entry-date="${date}"
          data-shift-id="${shift.id}"
          data-position="${e.position}"
          data-is-locked="${e.is_locked}"
          draggable="true"
          ondragstart="_onTokenDragStart(event)"
          oncontextmenu="_tokenContextMenu(event)">
          ${emp.abbreviation}
        </div>`;
      }).join('');

      // Slots vacíos
      const emptySlots = Math.max(0, shift.required_staff - cellEntries.length);
      const emptyHtml  = Array.from({length: emptySlots}).map((_, i) =>
        `<div class="emp-token" style="background:rgba(255,255,255,0.04);border:1px dashed var(--border-md);color:var(--text-400)"
          data-empty="true" data-entry-date="${date}" data-shift-id="${shift.id}" data-position="${cellEntries.length + i + 1}">
          + añadir
        </div>`
      ).join('');

      return `<td class="shift-cell ${shiftClass}"
        data-date="${date}" data-shift-id="${shift.id}"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="_onCellDrop(event, '${date}', ${shift.id})">
        <div class="cell-employees">${tokens}${emptyHtml}</div>
      </td>`;
    }).join('');

    return `<tr>
      <td class="shift-label-cell">
        <div class="shift-label-icon">${shiftIcon}</div>
        <div class="shift-label-name">${shift.name}</div>
        <div class="shift-label-hours">${shift.start_time}-${shift.end_time}</div>
      </td>
      ${cells}
    </tr>`;
  }).join('');

  // Off-day row
  const offCells = dates.map(date => {
    const dayOff = offBlocks.filter(b => b.start_date <= date && b.end_date >= date);
    const chips  = dayOff.map(b => `
      <span class="off-chip ${b.block_type}"
        style="background:${hexToRgba(b.color,0.15)};color:${b.color}">
        ${b.block_type === 'post_night' ? '😴' : '🏖️'} ${b.abbreviation}
      </span>`).join('');
    return `<td class="off-row-cell"><div class="off-chips">${chips || ''}</div></td>`;
  }).join('');

  return `<table class="schedule-grid">
    <thead>
      <tr>
        <th class="day-header col-hora" style="background:var(--bg-800)">
          <div class="day-name">TURNO</div>
        </th>
        ${dateHeaders}
      </tr>
    </thead>
    <tbody>
      ${shiftRows}
      <tr>
        <td class="shift-label-cell">
          <div class="shift-label-icon">🏖️</div>
          <div class="shift-label-name">Libres</div>
        </td>
        ${offCells}
      </tr>
    </tbody>
  </table>`;
}

// ── Drag & Drop ──────────────────────────────────────────────────────
function _onPaletteDragStart(event, empId) {
  _scheduleState.draggingEmpId = empId;
  _scheduleState.draggingFromCell = null;
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('text/plain', String(empId));
}

function _onTokenDragStart(event) {
  const t = event.currentTarget;
  _scheduleState.draggingEmpId     = Number(t.dataset.empId);
  _scheduleState.draggingFromCell  = {
    date: t.dataset.entryDate,
    shiftId: Number(t.dataset.shiftId),
    position: Number(t.dataset.position)
  };
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', t.dataset.empId);
}

async function _onCellDrop(event, date, shiftId) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');

  const empId = _scheduleState.draggingEmpId;
  if (!empId) return;

  const periodId = _scheduleState.currentPeriod.id;
  const shift    = _scheduleState.shiftTypes.find(s => s.id === shiftId);
  if (!shift) return;

  // Determinar posición libre
  const existing = _scheduleState.detail.entries.filter(
    e => e.entry_date === date && e.shift_type_id === shiftId
  );
  const alreadyThere = existing.find(e => e.employee_id === empId);
  if (alreadyThere) return; // ya está en esa celda

  const position = existing.length + 1;
  if (position > shift.required_staff + 1) {
    toast(`Turno ${shift.name} ya tiene el máximo de personas`, 'warning');
    return;
  }

  try {
    await API.updateEntry(periodId, { entry_date: date, shift_type_id: shiftId, position, employee_id: empId, is_locked: 1 });
    await _loadAndRenderPeriod(document.getElementById('view-container'), periodId);
    toast('Turno actualizado 🔒', 'success');
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
}

function _tokenContextMenu(event) {
  event.preventDefault();
  const t = event.currentTarget;
  const isLocked = t.dataset.isLocked === '1';
  const empId    = Number(t.dataset.empId);
  const date     = t.dataset.entryDate;
  const shiftId  = Number(t.dataset.shiftId);
  const position = Number(t.dataset.position);
  const periodId = _scheduleState.currentPeriod.id;

  Modal.open('Opciones de celda', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-3)">
      <button class="btn btn-secondary" onclick="Modal.close();_toggleLock(${periodId},'${date}',${shiftId},${position},${isLocked ? 0 : 1})">
        ${isLocked ? '🔓 Desbloquear celda' : '🔒 Bloquear celda'}
      </button>
      <button class="btn btn-danger" onclick="Modal.close();_removeEntry(${periodId},'${date}',${shiftId},${empId})">
        🗑️ Quitar de este turno
      </button>
    </div>`);
}

async function _toggleLock(periodId, date, shiftId, position, lock) {
  await API.lockEntry(periodId, { entry_date: date, shift_type_id: shiftId, position, is_locked: lock });
  await _loadAndRenderPeriod(document.getElementById('view-container'), periodId);
  toast(lock ? 'Celda bloqueada 🔒' : 'Celda desbloqueada 🔓', 'info');
}

async function _removeEntry(periodId, date, shiftId, empId) {
  // We update the entry with position freed — simplest: rebalance will fill it
  // For now mark it as a removal by setting to the "empty" state
  const entry = _scheduleState.detail.entries.find(
    e => e.entry_date === date && e.shift_type_id === shiftId && e.employee_id === empId
  );
  if (!entry) return;
  // We repurpose the update endpoint to set is_day_off=1 as placeholder, then rebalance
  toast('Usa Rebalancear para redistribuir ↗', 'info');
}

function _setupCellDnD() {}  // DnD setup via inline handlers

// ── Actions ──────────────────────────────────────────────────────────
function _selectPeriod(id) {
  _scheduleState.currentWeek = 0;
  _loadAndRenderPeriod(document.getElementById('view-container'), id);
}

function _setWeek(week) {
  _scheduleState.currentWeek = week;
  _renderFull(document.getElementById('view-container'));
}

function _saveNotes(notes) {
  API.setNotes(_scheduleState.currentPeriod.id, notes).catch(e => toast(e.message, 'error'));
}

async function _toggleStatus() {
  const cur = _scheduleState.currentPeriod.status;
  const next = cur === 'draft' ? 'published' : 'draft';
  await API.setStatus(_scheduleState.currentPeriod.id, next);
  await _loadAndRenderPeriod(document.getElementById('view-container'), _scheduleState.currentPeriod.id);
  toast(next === 'published' ? '✅ Período publicado' : '📝 Vuelto a borrador', 'success');
}

async function _rebalance() {
  const ok = await Modal.confirm('Rebalancear horario',
    'Se reorganizarán las celdas no bloqueadas para equilibrar los turnos. Las celdas 🔒 bloqueadas no se tocarán. ¿Continuar?');
  if (!ok) return;
  try {
    const result = await API.rebalance(_scheduleState.currentPeriod.id);
    await _loadAndRenderPeriod(document.getElementById('view-container'), _scheduleState.currentPeriod.id);
    if (result.warnings?.length) {
      toast(`⚠️ Rebalanceado con ${result.warnings.length} advertencia(s)`, 'warning');
    } else {
      toast('✅ Horario rebalanceado', 'success');
    }
  } catch(e) { toast(e.message, 'error'); }
}

async function _deletePeriod() {
  const ok = await Modal.confirm('Eliminar período', `¿Eliminar el período ${formatDateRange(_scheduleState.currentPeriod.start_date, _scheduleState.currentPeriod.end_date)}? Esta acción no se puede deshacer.`);
  if (!ok) return;
  await API.deleteSchedule(_scheduleState.currentPeriod.id);
  _scheduleState.currentPeriod = null;
  _scheduleState.detail = null;
  await renderScheduleEditor(document.getElementById('view-container'));
  toast('Período eliminado', 'info');
}

async function _sendNotifications() {
  const ok = await Modal.confirm('Enviar notificaciones',
    'Se enviarán los horarios por email a todos los empleados que tienen email configurado. ¿Continuar?');
  if (!ok) return;
  try {
    const result = await API.notifySchedule(_scheduleState.currentPeriod.id);
    toast(`📧 Enviado a: ${result.sent.join(', ')}`, 'success', 6000);
    if (result.failed.length) toast(`❌ Fallaron: ${result.failed.map(f=>f.name).join(', ')}`, 'error', 6000);
  } catch(e) { toast(e.message, 'error'); }
}

function _exportPDF() {
  window.print();
  toast('📥 Imprime o guarda como PDF desde el diálogo', 'info', 5000);
}

function _showGenerateModal(container) {
  const { start, end } = defaultPeriodDates();
  Modal.open('Generar nuevo período', `
    <div class="form-row">
      <div class="form-group">
        <label>Fecha inicio</label>
        <input id="gen-start" type="date" class="form-input" value="${start}" />
      </div>
      <div class="form-group">
        <label>Fecha fin (15 días recomendado)</label>
        <input id="gen-end" type="date" class="form-input" value="${end}" />
      </div>
    </div>
    <p style="font-size:var(--text-sm);color:var(--text-300)">
      El horario se generará automáticamente. Podrás editarlo con drag & drop después.
    </p>`,
    `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
     <button id="btn-gen-confirm" class="btn btn-primary">✨ Generar</button>`
  );
  document.getElementById('btn-gen-confirm').onclick = async () => {
    const startDate = document.getElementById('gen-start').value;
    const endDate   = document.getElementById('gen-end').value;
    if (!startDate || !endDate) return toast('Fechas requeridas', 'warning');
    const btn = document.getElementById('btn-gen-confirm');
    setLoading(btn, true);
    try {
      const result = await API.generateSchedule({ start_date: startDate, end_date: endDate });
      Modal.close();
      _scheduleState.currentWeek = 0;
      _scheduleState.currentPeriod = null;
      const periods = await API.getSchedules();
      _scheduleState.periods = periods;
      await _loadAndRenderPeriod(container, result.id);
      if (result.warnings?.length) {
        toast(`✅ Generado con ${result.warnings.length} advertencia(s)`, 'warning', 5000);
      } else {
        toast('✅ Horario generado correctamente', 'success');
      }
    } catch(e) {
      toast(e.message, 'error');
      setLoading(btn, false);
    }
  };

  // Auto-calc end date
  document.getElementById('gen-start').addEventListener('change', e => {
    document.getElementById('gen-end').value = addDays(e.target.value, 14);
  });
}

// ── Helper: get all dates between start and end ──────────────────────
function _getPeriodDates(startDate, endDate) {
  const dates = [];
  const cur   = new Date(startDate + 'T00:00:00');
  const end   = new Date(endDate   + 'T00:00:00');
  while (cur <= end) { dates.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
  return dates;
}
