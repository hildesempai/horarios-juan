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
          <button class="btn btn-success btn-sm" onclick="_exportExcel()">
            📊 Exportar Excel
          </button>
          <button class="btn btn-info btn-sm" onclick="_exportPDF()">
            🖨️ Imprimir / PDF
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

      <!-- Employee palette & Balance -->
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:20px; margin-top:var(--sp-4)">
        <div class="employee-palette" style="flex:1; min-width:300px">
          <div class="palette-title">EMPLEADOS — ARRASTRA AL GRID</div>
          <div class="palette-chips">${palette}</div>
        </div>
        
        <div class="employee-balance" style="flex:2; min-width:300px">
          <div class="palette-title" style="margin-bottom:10px">BALANCE SEMANA ${currentWeek + 1}</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap">
            ${employees.map(emp => {
              const weekDates = getWeekDates(currentPeriod.start_date, currentWeek);
              const shiftsThisWeek = detail.entries.filter(e => e.employee_id === emp.id && weekDates.includes(e.entry_date)).length;
              const offThisWeek = weekDates.filter(date => {
                const shiftsOnDate = detail.entries.filter(e => e.employee_id === emp.id && e.entry_date === date).length;
                return shiftsOnDate === 0;
              }).length;
              
              let warningIcon = '';
              let warningMsg = '';
              
              if (shiftsThisWeek > 7) {
                warningIcon = '⚠️';
                warningMsg = `Sobrecarga: ${shiftsThisWeek} turnos (Máx 7)`;
              } else if (shiftsThisWeek < 7) {
                warningIcon = '⚠️';
                warningMsg = `Faltan turnos: ${shiftsThisWeek}/7`;
              }
              
              return `
                <div class="balance-card" style="background:var(--bg-800); padding:8px 12px; border-radius:var(--radius-md); border:1px solid var(--bg-700); display:flex; align-items:center; gap:10px">
                  <div style="color:${emp.color}; font-weight:bold; font-size:12px; width:40px">${emp.abbreviation}</div>
                  <div style="font-size:12px; color:var(--text-300); display:flex; gap:8px">
                    <span title="Turnos asignados esta semana (ideal: 7)">💼 ${shiftsThisWeek}</span>
                    <span style="opacity:0.3">|</span>
                    <span title="Días libres asignados esta semana">🏖️ ${offThisWeek}</span>
                    ${warningIcon ? `<span style="cursor:help; margin-left:5px" title="${warningMsg}">${warningIcon}</span>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
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
          style="--emp-bg:${bg};--emp-border:${bdr};--emp-color:${emp.color};background:var(--emp-bg);border-color:var(--emp-border);color:var(--emp-color)"
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

  // Off-day row (calculado dinámicamente según quién no tiene turnos asignados ese día)
  const offCells = dates.map(date => {
    const freeEmployees = employees.filter(emp => {
      const hasShift = entries.some(e => e.employee_id === emp.id && e.entry_date === date);
      return !hasShift;
    });

    const chips = freeEmployees.map(emp => {
      const block = offBlocks.find(b => b.employee_id === emp.id && b.start_date <= date && b.end_date >= date);
      const isPostNight = block && block.block_type === 'post_night';
      const icon = isPostNight ? '😴' : '🏖️';
      const bg = hexToRgba(emp.color, 0.15);
      return `
        <span class="off-chip ${isPostNight ? 'post_night' : ''}"
          style="--emp-bg:${bg};--emp-color:${emp.color};background:var(--emp-bg);color:var(--emp-color)">
          <span class="print-emoji">${icon}</span> ${emp.abbreviation}
        </span>`;
    }).join('');
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
  const sourceCell = _scheduleState.draggingFromCell; // { date, shiftId, position }
  if (!empId) return;

  const periodId = _scheduleState.currentPeriod.id;
  const shift    = _scheduleState.shiftTypes.find(s => s.id === shiftId);
  if (!shift) return;

  // 1. Validaciones
  const isOff = _scheduleState.detail.offBlocks.some(b => b.employee_id === empId && b.start_date <= date && b.end_date >= date);
  if (isOff) {
    const ok = await Modal.confirm('Día Libre', 'Este empleado tiene marcado este día como libre. ¿Asignar de todos modos?');
    if (!ok) return;
  }

  // 2. Colisión y Swap/Replace
  const existing = _scheduleState.detail.entries.filter(e => e.entry_date === date && e.shift_type_id === shiftId);
  const alreadyThere = existing.find(e => e.employee_id === empId);
  if (alreadyThere) return; // ya está en esta celda

  let targetEmpId = null;
  let targetPos = null;

  const targetToken = event.target.closest('.emp-token');
  
  if (targetToken && targetToken.dataset.empty) {
    // Si soltó exactamente en el hueco vacío
    targetEmpId = null;
    targetPos = Number(targetToken.dataset.position);
  } else if (existing.length < shift.required_staff) {
    // Si hay espacio pero no soltó en el hueco vacío exacto, buscar el primer `position` libre
    const usedPositions = new Set(existing.map(e => e.position));
    targetPos = 1;
    while (usedPositions.has(targetPos)) targetPos++;
    targetEmpId = null;
  } else if (targetToken && !targetToken.dataset.empty) {
    // Si está lleno y apuntó a alguien específicamente
    targetEmpId = Number(targetToken.dataset.empId);
    targetPos = Number(targetToken.dataset.position);
  } else {
    // Si está lleno pero soltó en la celda en general, reemplazar al último
    targetEmpId = existing[existing.length - 1].employee_id;
    targetPos = existing[existing.length - 1].position;
  }

  if (targetEmpId) {
    const action = await new Promise(resolve => {
      Modal.open('Conflicto de turno', `
        <p>El turno ya está ocupado por <b>${_scheduleState.employees.find(e=>e.id===targetEmpId).name}</b>.</p>
        <p>¿Qué deseas hacer?</p>
        <div style="display:flex;gap:10px;margin-top:20px;justify-content:center">
          <button class="btn btn-primary" id="btn-swap">🔄 Intercambiar</button>
          <button class="btn btn-danger" id="btn-replace">🗑️ Reemplazar</button>
          <button class="btn btn-secondary" id="btn-cancel">Cancelar</button>
        </div>
      `);
      let resolved = false;
      document.getElementById('btn-swap').onclick = () => { resolved = true; Modal.close(); resolve('swap'); };
      document.getElementById('btn-replace').onclick = () => { resolved = true; Modal.close(); resolve('replace'); };
      document.getElementById('btn-cancel').onclick = () => { resolved = true; Modal.close(); resolve(null); };
      
      const oldClose = Modal.close;
      Modal.close = () => { 
        if (!resolved) resolve(null); 
        Modal.close = oldClose; 
        oldClose(); 
      };
    });

    if (!action) return;

    try {
      await API.swapEntry(periodId, {
        source: { date: sourceCell?.date, shift: sourceCell?.shiftId, pos: sourceCell?.position, emp: empId },
        target: { date, shift: shiftId, pos: targetPos, emp: targetEmpId },
        action
      });
      await _loadAndRenderPeriod(document.getElementById('view-container'), periodId);
      toast('Turno actualizado 🔄', 'success');
    } catch(e) { toast('Error: ' + e.message, 'error'); }
    return;
  }

  // Flujo normal (celda vacía)
  try {
    if (sourceCell) {
       await API.swapEntry(periodId, {
         source: { date: sourceCell.date, shift: sourceCell.shiftId, pos: sourceCell.position, emp: empId },
         target: { date, shift: shiftId, pos: targetPos, emp: null },
         action: 'move'
       });
    } else {
       await API.updateEntry(periodId, { entry_date: date, shift_type_id: shiftId, position: targetPos, employee_id: empId, is_locked: 1 });
    }
    await _loadAndRenderPeriod(document.getElementById('view-container'), periodId);
    toast('Turno actualizado 🔒', 'success');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
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
      _showWarningsModal(result.warnings);
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
  Modal.open('Opciones de Impresión / PDF', `
    <div style="display:flex; flex-direction:column; gap:15px; padding:10px 0">
      <p style="color:var(--text-200); font-size:14px; margin:0">Elige el estilo visual para la impresión o guardado en PDF:</p>
      
      <div style="display:flex; gap:15px">
        <button id="print-opt-color" class="btn btn-primary" style="flex:1; padding:20px; display:flex; flex-direction:column; align-items:center; gap:8px; white-space:normal">
          <span style="font-size:24px">🎨</span>
          <span style="font-weight:bold">A Color</span>
          <span style="font-size:11px; opacity:0.8; font-weight:normal">Fondo de turnos pastel, fichas con color y emojis</span>
        </button>
        
        <button id="print-opt-bw" class="btn btn-secondary" style="flex:1; padding:20px; display:flex; flex-direction:column; align-items:center; gap:8px; border: 1px solid var(--border); white-space:normal">
          <span style="font-size:24px">📄</span>
          <span style="font-weight:bold; color:var(--text-100)">Blanco y Negro</span>
          <span style="font-size:11px; opacity:0.8; font-weight:normal; color:var(--text-300)">Sin colores de fondo en turnos y sin emojis en descansos</span>
        </button>
      </div>
    </div>
  `, `
    <button class="btn btn-ghost" onclick="Modal.close()">Cancelar</button>
  `);

  document.getElementById('print-opt-color').onclick = () => {
    document.body.classList.remove('print-bw');
    document.body.classList.add('print-color');
    Modal.close();
    setTimeout(() => {
      window.print();
    }, 100);
  };

  document.getElementById('print-opt-bw').onclick = () => {
    document.body.classList.remove('print-color');
    document.body.classList.add('print-bw');
    Modal.close();
    setTimeout(() => {
      window.print();
    }, 100);
  };
}

function _exportExcel() {
  const { currentPeriod, detail, employees, shiftTypes } = _scheduleState;
  if (!detail) return;

  const { period, entries, offBlocks } = detail;
  const periodDates = _getPeriodDates(period.start_date, period.end_date);

  // Construir matriz de datos para Excel
  const headers = ["Turno"];
  periodDates.forEach(d => {
    headers.push(`${getDayName(d)} ${formatDate(d)}`);
  });

  const rows = [];
  rows.push(headers);

  // Agrupar por turnos activos
  const activeShifts = shiftTypes.filter(s => s.active).sort((a, b) => a.sort_order - b.sort_order);
  activeShifts.forEach(shift => {
    const row = [shift.name];
    periodDates.forEach(date => {
      const dayEntries = entries.filter(e => e.entry_date === date && e.shift_type_id === shift.id);
      const staffNames = dayEntries.map(e => e.emp_name || "").join(", ");
      row.push(staffNames || "—");
    });
    rows.push(row);
  });

  // Fila de descanso / libres (calculado dinámicamente según quién no tiene turnos ese día)
  const libresRow = ["Descansos / Libres"];
  periodDates.forEach(date => {
    const freeEmployees = employees.filter(emp => {
      const hasShift = entries.some(e => e.employee_id === emp.id && e.entry_date === date);
      return !hasShift;
    });
    const staffOff = freeEmployees.map(emp => emp.abbreviation).join(", ");
    libresRow.push(staffOff || "—");
  });
  rows.push(libresRow);

  // Formato CSV con punto y coma (;) para compatibilidad nativa en Excel español/latinoamericano
  // con BOM (Byte Order Mark) para detectar codificación UTF-8 de forma correcta.
  const csvContent = "\uFEFF" + rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(";")).join("\r\n");

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  
  const filename = `Horario_${period.start_date}_a_${period.end_date}.csv`;
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  toast('📊 Excel exportado con éxito', 'success');
}

function _showGenerateModal(container) {
  const { start } = defaultPeriodDates();
  
  const renderOffDaysGrid = (startDate) => {
    const dates = _getPeriodDates(startDate, addDays(startDate, 13)); // 14 días
    const { employees } = _scheduleState;
    
    let html = `<div style="overflow-x:auto;margin-top:15px;background:var(--bg-800);border-radius:var(--radius-md)"><table class="schedule-grid" style="font-size:12px;width:100%"><thead><tr><th style="padding:8px">Empleado</th>`;
    dates.forEach(d => {
      html += `<th style="padding:4px;text-align:center">${d.slice(8,10)}<br>${getDayName(d).slice(0,2)}</th>`;
    });
    html += `</tr></thead><tbody>`;
    
    employees.forEach(emp => {
      html += `<tr><td style="white-space:nowrap;padding:8px;font-weight:bold;color:${emp.color}">${emp.abbreviation}</td>`;
      dates.forEach(d => {
        html += `<td style="text-align:center;padding:2px"><input type="checkbox" class="off-day-cb" data-emp="${emp.id}" data-date="${d}" style="cursor:pointer" /></td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    return html;
  };

  Modal.open('Generar nuevo período', `
    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label>Fecha inicio (14 días automáticos)</label>
        <input id="gen-start" type="date" class="form-input" value="${start}" />
      </div>
    </div>
    <p style="font-size:var(--text-sm);color:var(--text-300);margin-top:10px;">
      Marca los días que deseas que cada empleado tenga <b>LIBRE</b>:
    </p>
    <div id="gen-off-grid">${renderOffDaysGrid(start)}</div>
    `,
    `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
     <button id="btn-gen-confirm" class="btn btn-primary">✨ Generar</button>`
  );

  document.getElementById('gen-start').addEventListener('change', e => {
    document.getElementById('gen-off-grid').innerHTML = renderOffDaysGrid(e.target.value);
  });

  document.getElementById('btn-gen-confirm').onclick = async () => {
    const startDate = document.getElementById('gen-start').value;
    const endDate   = addDays(startDate, 13);
    if (!startDate) return toast('Fechas requeridas', 'warning');
    
    const requested_off_days = {};
    document.querySelectorAll('.off-day-cb:checked').forEach(cb => {
      const emp = cb.dataset.emp;
      const date = cb.dataset.date;
      if (!requested_off_days[emp]) requested_off_days[emp] = [];
      requested_off_days[emp].push(date);
    });

    const btn = document.getElementById('btn-gen-confirm');
    setLoading(btn, true);
    try {
      const result = await API.generateSchedule({ start_date: startDate, end_date: endDate, requested_off_days });
      Modal.close();
      _scheduleState.currentWeek = 0;
      _scheduleState.currentPeriod = null;
      const periods = await API.getSchedules();
      _scheduleState.periods = periods;
      await _loadAndRenderPeriod(container, result.id);
      if (result.warnings?.length) {
        toast(`✅ Generado con ${result.warnings.length} advertencia(s)`, 'warning', 5000);
        _showWarningsModal(result.warnings);
      } else {
        toast('✅ Horario generado correctamente', 'success');
      }
    } catch(e) {
      toast(e.message, 'error');
      setLoading(btn, false);
    }
  };
}

// ── Helper: get all dates between start and end ──────────────────────
function _getPeriodDates(startDate, endDate) {
  const dates = [];
  const cur   = new Date(startDate + 'T00:00:00');
  const end   = new Date(endDate   + 'T00:00:00');
  while (cur <= end) { dates.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
  return dates;
}

// ── Mostrar modal de advertencias ────────────────────────────────────
function _showWarningsModal(warnings) {
  const html = `
    <div style="max-height: 400px; overflow-y: auto; background: var(--bg-800); padding: 15px; border-radius: var(--radius-md);">
      <ul style="padding-left: 20px; margin: 0; color: var(--text-200); font-size: var(--text-sm);">
        ${warnings.map(w => `<li style="margin-bottom: 8px;">${w}</li>`).join('')}
      </ul>
    </div>
  `;
  Modal.open('⚠️ Advertencias del Motor', html, `<button class="btn btn-secondary" onclick="Modal.close()">Cerrar</button>`);
}
