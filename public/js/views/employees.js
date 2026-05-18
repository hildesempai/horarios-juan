/* views/employees.js — Gestión de empleados, suplentes y tipos */

async function renderEmployees(container) {
  container.innerHTML = `<div class="page"><div class="spinner" style="margin:4rem auto;display:block"></div></div>`;
  const [employees, types] = await Promise.all([API.getEmployees(true), API.getEmployeeTypes()]);
  const titulares  = employees.filter(e => !e.is_substitute && e.active);
  const suplentes  = employees.filter(e =>  e.is_substitute && e.active);
  const inactivos  = employees.filter(e => !e.active);

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="section-title">Empleados</div>
          <div class="section-subtitle">Gestión de personal y tipos</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary" onclick="_showTypeModal()">🏷️ Tipos de empleado</button>
          <button class="btn btn-primary" onclick="_showEmpModal(null)">➕ Nuevo empleado</button>
        </div>
      </div>

      <!-- Titulares -->
      <div class="card" style="margin-bottom:var(--sp-4)">
        <div class="card-header">
          <div class="card-title">👥 Titulares (${titulares.length})</div>
        </div>
        ${_empTable(titulares, types)}
      </div>

      <!-- Suplentes -->
      <div class="card" style="margin-bottom:var(--sp-4)">
        <div class="card-header">
          <div class="card-title">🔄 Suplentes (${suplentes.length})</div>
          <button class="btn btn-secondary btn-sm" onclick="_showEmpModal(null, true)">➕ Añadir suplente</button>
        </div>
        ${suplentes.length ? _empTable(suplentes, types) : `<p style="color:var(--text-400);font-size:var(--text-sm)">No hay suplentes registrados</p>`}
      </div>

      <!-- Inactivos -->
      ${inactivos.length ? `
        <div class="card">
          <div class="card-header">
            <div class="card-title" style="color:var(--text-400)">🚫 Inactivos (${inactivos.length})</div>
          </div>
          ${_empTable(inactivos, types, true)}
        </div>` : ''}
    </div>`;
}

function _empTable(employees, types, inactive = false) {
  if (!employees.length) return `<p style="color:var(--text-400);font-size:var(--text-sm)">Sin empleados en esta categoría</p>`;
  return `<table class="data-table">
    <thead><tr><th>Empleado</th><th>Tipo</th><th>Email</th><th>Días libres</th><th>Acciones</th></tr></thead>
    <tbody>
      ${employees.map(e => `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:var(--sp-3)">
              <div style="width:28px;height:28px;border-radius:50%;background:${e.color};display:flex;align-items:center;justify-content:center;font-size:var(--text-xs);font-weight:800;color:#fff">${e.abbreviation}</div>
              <div>
                <div style="font-weight:600;color:var(--text-100)">${e.name}</div>
                <div style="font-size:var(--text-xs);color:var(--text-400)">${e.abbreviation}</div>
              </div>
            </div>
          </td>
          <td><span class="badge badge-accent">${e.type_name || '—'}</span></td>
          <td style="color:var(--text-300)">${e.email || '—'}</td>
          <td><span class="badge badge-muted">${e.off_days || '?'} días</span></td>
          <td>
            <div style="display:flex;gap:var(--sp-2)">
              <button class="btn btn-secondary btn-sm" title="Notas y Agenda Personal" onclick="_showNotesModal(${JSON.stringify(e).replace(/"/g,'&quot;')})">📋 Notas</button>
              <button class="btn btn-secondary btn-sm" onclick="_showEmpModal(${JSON.stringify(e).replace(/"/g,'&quot;')})">✏️</button>
              ${inactive
                ? `<button class="btn btn-success btn-sm" onclick="_reactivateEmp(${e.id})" title="Reactivar">↩️ Reactivar</button>`
                : `<button class="btn btn-danger btn-sm" onclick="_deactivateEmp(${e.id})" title="Desactivar">🚫</button>`
              }
              <button class="btn btn-danger btn-sm" title="Eliminar Permanentemente" onclick="_deleteEmpPermanent(${e.id}, '${e.name.replace(/'/g, "\\'")}')">🗑️</button>
            </div>
          </td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

async function _showEmpModal(emp, isSubstitute = false) {
  const types = await API.getEmployeeTypes();
  const typeOptions = types.map(t =>
    `<option value="${t.id}" ${emp?.type_id === t.id ? 'selected' : ''}>${t.name} (${t.off_days} días libres)</option>`
  ).join('');
  const isNew = !emp;

  Modal.open(isNew ? 'Nuevo empleado' : `Editar: ${emp.name}`, `
    <div class="form-row">
      <div class="form-group">
        <label>Nombre completo</label>
        <input id="emp-name" class="form-input" value="${emp?.name || ''}" placeholder="Ej: Juan Pérez" />
      </div>
      <div class="form-group">
        <label>Abreviatura (máx 4)</label>
        <input id="emp-abbr" class="form-input" maxlength="4" value="${emp?.abbreviation || ''}" placeholder="JU" style="text-transform:uppercase" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Tipo de empleado</label>
        <select id="emp-type" class="form-select"><option value="">— Sin tipo —</option>${typeOptions}</select>
      </div>
      <div class="form-group">
        <label>Email (para notificaciones)</label>
        <input id="emp-email" type="email" class="form-input" value="${emp?.email || ''}" placeholder="juan@email.com" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Color identificativo</label>
        <div style="display:flex;align-items:center;gap:var(--sp-3)">
          <input id="emp-color" type="color" value="${emp?.color || '#6366f1'}" style="width:48px;height:36px;border-radius:var(--radius-sm);border:1px solid var(--border-md);background:transparent;cursor:pointer" />
          <span id="emp-color-preview" style="font-size:var(--text-sm);color:var(--text-300)">Elige un color</span>
        </div>
      </div>
      <div class="form-group">
        <label>Rol</label>
        <select id="emp-sub" class="form-select">
          <option value="0" ${!emp?.is_substitute ? 'selected' : ''}>Titular</option>
          <option value="1" ${emp?.is_substitute  ? 'selected' : ''}>Suplente</option>
        </select>
      </div>
    </div>`,
    `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
     <button id="btn-save-emp" class="btn btn-primary">${isNew ? '➕ Crear' : '💾 Guardar'}</button>`
  );

  document.getElementById('emp-color').addEventListener('input', e => {
    document.getElementById('emp-color-preview').style.color = e.target.value;
    document.getElementById('emp-color-preview').textContent = e.target.value;
  });

  document.getElementById('btn-save-emp').onclick = async () => {
    const data = {
      name:         document.getElementById('emp-name').value.trim(),
      abbreviation: document.getElementById('emp-abbr').value.trim(),
      type_id:      document.getElementById('emp-type').value || null,
      email:        document.getElementById('emp-email').value.trim(),
      color:        document.getElementById('emp-color').value,
      is_substitute: Number(document.getElementById('emp-sub').value),
      active: 1
    };
    if (!data.name || !data.abbreviation) return toast('Nombre y abreviatura requeridos', 'warning');
    const btn = document.getElementById('btn-save-emp');
    setLoading(btn, true);
    try {
      if (isNew) await API.createEmployee(data);
      else       await API.updateEmployee(emp.id, data);
      Modal.close();
      await renderEmployees(document.getElementById('view-container'));
      toast(isNew ? '✅ Empleado creado' : '✅ Empleado actualizado', 'success');
    } catch(e) { toast(e.message, 'error'); setLoading(btn, false); }
  };
}

async function _deactivateEmp(id) {
  const ok = await Modal.confirm('Desactivar empleado', '¿Desactivar este empleado? No aparecerá en nuevos horarios, pero el historial se conserva.');
  if (!ok) return;
  await API.deleteEmployee(id);
  await renderEmployees(document.getElementById('view-container'));
  toast('Empleado desactivado', 'info');
}

async function _reactivateEmp(id) {
  const employees = await API.getEmployees(true);
  const emp = employees.find(e => e.id === id);
  if (!emp) return;
  await API.updateEmployee(id, { ...emp, active: 1 });
  await renderEmployees(document.getElementById('view-container'));
  toast('✅ Empleado reactivado', 'success');
}

async function _deleteEmpPermanent(id, name) {
  // Primera confirmación
  const firstOk = await Modal.confirm(
    '⚠️ Eliminar empleado (Paso 1 de 2)',
    `¿Estás seguro de que deseas eliminar permanentemente a <strong>${name}</strong>? Esta acción no se puede deshacer.`
  );
  if (!firstOk) return;

  // Segunda confirmación
  const secondOk = await Modal.confirm(
    '🚨 Confirmación definitiva (Paso 2 de 2)',
    `¡ATENCIÓN! Estás a punto de borrar permanentemente a <strong>${name}</strong> de la base de datos junto con todas sus notas personales.<br><br>¿Confirmas la eliminación definitiva?`
  );
  if (!secondOk) return;

  try {
    await API.deleteEmployeePermanent(id);
    await renderEmployees(document.getElementById('view-container'));
    toast('✅ Empleado eliminado permanentemente', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function _showTypeModal() {
  const types = await API.getEmployeeTypes();
  const rows = types.map(t => `
    <tr>
      <td style="font-weight:600">${t.name}</td>
      <td><span class="badge badge-muted">${t.off_days} días</span></td>
      <td><span class="badge badge-${t.consecutive_off ? 'accent' : 'muted'}">${t.consecutive_off ? 'Consecutivos' : 'Separados'}</span></td>
      <td>
        <div style="display:flex;gap:var(--sp-2)">
          <button class="btn btn-secondary btn-sm" onclick="_editType(${JSON.stringify(t).replace(/"/g,'&quot;')})">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="_deleteType(${t.id})">🗑️</button>
        </div>
      </td>
    </tr>`).join('');

  Modal.open('Tipos de empleado', `
    <table class="data-table" style="margin-bottom:var(--sp-4)">
      <thead><tr><th>Tipo</th><th>Días libres</th><th>Consecutivos</th><th>Acciones</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="border-top:1px solid var(--border);padding-top:var(--sp-4)">
      <div style="font-weight:700;margin-bottom:var(--sp-3)">➕ Nuevo tipo</div>
      <div class="form-row">
        <div class="form-group">
          <label>Nombre</label>
          <input id="type-name" class="form-input" placeholder="Ej: Residente" />
        </div>
        <div class="form-group">
          <label>Días libres por período</label>
          <input id="type-days" type="number" min="1" max="10" class="form-input" value="2" />
        </div>
      </div>
      <label class="toggle-wrap">
        <div id="type-consec" class="toggle active"></div>
        <span style="font-size:var(--text-sm)">Días libres consecutivos</span>
      </label>
    </div>`,
    `<button class="btn btn-secondary" onclick="Modal.close()">Cerrar</button>
     <button id="btn-save-type" class="btn btn-primary">➕ Crear tipo</button>`
  );

  document.getElementById('type-consec').onclick = function() { this.classList.toggle('active'); };
  document.getElementById('btn-save-type').onclick = async () => {
    const name   = document.getElementById('type-name').value.trim();
    const days   = Number(document.getElementById('type-days').value);
    const consec = document.getElementById('type-consec').classList.contains('active');
    if (!name) return toast('Nombre requerido', 'warning');
    try {
      await API.createEmployeeType({ name, off_days: days, consecutive_off: consec });
      Modal.close();
      toast('✅ Tipo creado', 'success');
    } catch(e) { toast(e.message, 'error'); }
  };
}

async function _deleteType(id) {
  const ok = await Modal.confirm('Eliminar tipo', '¿Eliminar este tipo de empleado?');
  if (!ok) return;
  try {
    await API.deleteEmployeeType(id);
    await _showTypeModal();
    toast('Tipo eliminado', 'info');
  } catch(e) { toast(e.message, 'error'); }
}

async function _showNotesModal(emp) {
  let notes = [];
  try {
    notes = await API.getEmployeeNotes(emp.id);
  } catch (e) {
    toast(e.message, 'error');
    return;
  }

  let year = new Date().getFullYear();
  let month = new Date().getMonth();

  const containerId = `notes-modal-content-${emp.id}`;

  const styles = `
    <style>
      .notes-modal-layout {
        display: grid;
        grid-template-columns: 1.2fr 1fr;
        gap: var(--sp-4);
        min-height: 480px;
        color: var(--text-200);
      }
      @media (max-width: 768px) {
        .notes-modal-layout {
          grid-template-columns: 1fr;
          min-height: auto;
        }
      }
      .notes-pane-left {
        display: flex;
        flex-direction: column;
        gap: var(--sp-4);
        border-right: 1px solid var(--border);
        padding-right: var(--sp-4);
      }
      .notes-pane-right {
        display: flex;
        flex-direction: column;
        gap: var(--sp-3);
      }
      .note-entry-form {
        background: var(--bg-600);
        padding: var(--sp-3);
        border-radius: var(--radius);
        border: 1px solid var(--border-md);
        display: flex;
        flex-direction: column;
        gap: var(--sp-2);
      }
      .notes-scroller {
        max-height: 250px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: var(--sp-2);
        padding-right: 4px;
      }
      .note-item {
        background: var(--bg-600);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: var(--sp-2) var(--sp-3);
        position: relative;
        border-left: 4px solid var(--tag-color, var(--text-400));
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }
      .note-item-content {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex-grow: 1;
      }
      .note-item-meta {
        display: flex;
        align-items: center;
        gap: var(--sp-2);
        font-size: 10px;
      }
      .note-item-date {
        color: var(--text-300);
        font-weight: 600;
      }
      .note-item-tag {
        text-transform: uppercase;
        font-weight: 700;
        font-size: 8px;
        padding: 1px 6px;
        border-radius: var(--radius-full);
        background: var(--tag-bg);
        color: var(--tag-color);
      }
      .note-item-body {
        color: var(--text-100);
        font-size: var(--text-sm);
        white-space: pre-wrap;
        line-height: 1.4;
      }
      .note-del-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: var(--text-sm);
        color: var(--text-400);
        transition: color var(--transition);
        padding: 0 0 0 var(--sp-2);
      }
      .note-del-btn:hover {
        color: var(--danger);
      }
      
      /* Mini calendar styles */
      .mini-cal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--bg-800);
        padding: var(--sp-2);
        border-radius: var(--radius-sm);
      }
      .mini-cal-title {
        font-weight: 700;
        font-size: var(--text-sm);
        color: var(--text-100);
      }
      .mini-cal-nav {
        display: flex;
        gap: 2px;
      }
      .mini-cal-btn {
        background: var(--bg-600);
        border: 1px solid var(--border);
        color: var(--text-200);
        padding: 2px 6px;
        font-size: 10px;
        border-radius: var(--radius-sm);
        cursor: pointer;
      }
      .mini-cal-btn:hover {
        background: var(--bg-500);
      }
      .mini-cal-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 4px;
        background: var(--bg-800);
        border-radius: var(--radius-sm);
        padding: var(--sp-2);
      }
      .mini-cal-day-header {
        text-align: center;
        font-weight: 700;
        font-size: 8px;
        color: var(--text-300);
        text-transform: uppercase;
        padding-bottom: 2px;
      }
      .mini-cal-day {
        aspect-ratio: 1.1;
        background: var(--bg-700);
        border-radius: 4px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
        color: var(--text-200);
        position: relative;
        cursor: pointer;
        transition: background var(--transition);
      }
      .mini-cal-day:hover {
        background: var(--bg-600);
      }
      .mini-cal-day.other-month {
        opacity: 0.15;
        pointer-events: none;
      }
      .mini-cal-day.active-date {
        border: 1px solid var(--accent);
      }
      .mini-cal-dots {
        display: flex;
        gap: 2px;
        position: absolute;
        bottom: 2px;
      }
      .mini-cal-dot {
        width: 4px;
        height: 4px;
        border-radius: 50%;
      }
    </style>
  `;

  const TAGS_META = {
    positivo: { label: 'Positivo 🟢', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
    negativo: { label: 'Negativo 🔴', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
    neutral: { label: 'Neutral ⚪', color: '#b8bdd8', bg: 'rgba(184,189,216,0.15)' },
    importante: { label: 'Importante 🟡', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
    licencia: { label: 'Licencia 🔵', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
    llamada_atencion: { label: 'Llamada de atención 🟣', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
    capacitacion: { label: 'Capacitación 🟢', color: '#06b6d4', bg: 'rgba(6,182,212,0.15)' }
  };

  const renderContent = () => {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    // Formulario de agregar nota
    const tagOptions = Object.entries(TAGS_META).map(([key, val]) =>
      `<option value="${key}">${val.label}</option>`
    ).join('');

    // Listado de notas
    const notesHTML = notes.map(note => {
      const meta = TAGS_META[note.tag] || { label: note.tag, color: '#7c84a8', bg: 'rgba(255,255,255,0.05)' };
      return `
        <div class="note-item" style="--tag-color: ${meta.color}">
          <div class="note-item-content">
            <div class="note-item-meta">
              <span class="note-item-date">${formatDate(note.note_date)}</span>
              <span class="note-item-tag" style="background:${meta.bg};color:${meta.color}">${note.tag}</span>
            </div>
            <div class="note-item-body">${note.content}</div>
          </div>
          <button class="note-del-btn" data-id="${note.id}" title="Eliminar nota">🗑️</button>
        </div>
      `;
    }).join('');

    // Celdas del minicalendario
    const firstDay = new Date(year, month, 1);
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;
    const totalDays = new Date(year, month + 1, 0).getDate();
    const totalDaysPrev = new Date(year, month, 0).getDate();

    const cells = [];
    for (let i = startOffset - 1; i >= 0; i--) {
      cells.push({ dayNum: totalDaysPrev - i, isCurrent: false });
    }
    for (let d = 1; d <= totalDays; d++) {
      cells.push({ dayNum: d, isCurrent: true });
    }
    const totalSlots = Math.ceil(cells.length / 7) * 7;
    const nextMonthNeeded = totalSlots - cells.length;
    for (let d = 1; d <= nextMonthNeeded; d++) {
      cells.push({ dayNum: d, isCurrent: false });
    }

    const monthStr = String(month + 1).padStart(2, '0');
    const prefix = `${year}-${monthStr}-`;

    const gridHTML = cells.map(cell => {
      if (!cell.isCurrent) {
        return `<div class="mini-cal-day other-month">${cell.dayNum}</div>`;
      }
      const dateStr = `${prefix}${String(cell.dayNum).padStart(2, '0')}`;
      const dayNotes = notes.filter(n => n.note_date === dateStr);

      const dotsHTML = dayNotes.map(n => {
        const meta = TAGS_META[n.tag] || { color: '#7c84a8' };
        return `<span class="mini-cal-dot" style="background:${meta.color}" title="${n.tag}: ${n.content.slice(0, 20)}..."></span>`;
      }).join('');

      return `
        <div class="mini-cal-day" data-date="${dateStr}">
          <span>${cell.dayNum}</span>
          <div class="mini-cal-dots">${dotsHTML}</div>
        </div>
      `;
    }).join('');

    const daysOfWeek = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    const weekHeadersHTML = daysOfWeek.map(d => `<div class="mini-cal-day-header">${d}</div>`).join('');

    return `
      <div class="notes-modal-layout" id="${containerId}">
        <!-- Columna izquierda: notas e ingreso -->
        <div class="notes-pane-left">
          <div class="note-entry-form">
            <div style="font-weight:700;font-size:var(--text-sm);color:var(--text-100)">➕ Nueva anotación</div>
            <div class="form-row" style="gap:var(--sp-2)">
              <div class="form-group" style="flex:1">
                <label style="font-size:10px">Fecha</label>
                <input type="date" id="new-note-date" class="form-input" style="padding:4px var(--sp-2);font-size:var(--text-sm)" value="${today()}" />
              </div>
              <div class="form-group" style="flex:1.2">
                <label style="font-size:10px">Etiqueta</label>
                <select id="new-note-tag" class="form-select" style="padding:4px var(--sp-2);font-size:var(--text-sm)">
                  ${tagOptions}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label style="font-size:10px">Comentario</label>
              <textarea id="new-note-content" class="form-input" rows="2" style="font-size:var(--text-sm);resize:none" placeholder="Escribe detalles aquí..."></textarea>
            </div>
            <button id="btn-add-note" class="btn btn-primary btn-sm" style="align-self:flex-end">➕ Guardar Nota</button>
          </div>

          <div style="font-weight:700;font-size:var(--text-sm);color:var(--text-100)">📋 Historial de notas (${notes.length})</div>
          <div class="notes-scroller">
            ${notesHTML.length ? notesHTML : `<p style="color:var(--text-400);font-size:var(--text-sm);text-align:center;padding:var(--sp-4)">Sin notas cargadas.</p>`}
          </div>
        </div>

        <!-- Columna derecha: agenda mensual -->
        <div class="notes-pane-right">
          <div style="font-weight:700;font-size:var(--text-sm);color:var(--text-100)">🗓️ Agenda Personal</div>
          <div class="mini-cal-header">
            <button class="mini-cal-btn" id="btn-prev-month">◀</button>
            <div class="mini-cal-title">${months[month]} ${year}</div>
            <button class="mini-cal-btn" id="btn-next-month">▶</button>
          </div>
          <div class="mini-cal-grid">
            ${weekHeadersHTML}
            ${gridHTML}
          </div>
        </div>
      </div>
    `;
  };

  Modal.open(`Ficha de Empleado: ${emp.name}`, `
    ${styles}
    <div id="notes-modal-wrapper">${renderContent()}</div>
  `, `<button class="btn btn-secondary" onclick="Modal.close()">Cerrar</button>`);

  const attachEvents = () => {
    // Navigation
    document.getElementById('btn-prev-month').onclick = () => {
      month--;
      if (month < 0) {
        month = 11;
        year--;
      }
      refresh();
    };
    document.getElementById('btn-next-month').onclick = () => {
      month++;
      if (month > 11) {
        month = 0;
        year++;
      }
      refresh();
    };

    // Add Note
    document.getElementById('btn-add-note').onclick = async () => {
      const date = document.getElementById('new-note-date').value;
      const tag = document.getElementById('new-note-tag').value;
      const content = document.getElementById('new-note-content').value.trim();

      if (!date || !content) {
        toast('Fecha y contenido requeridos', 'warning');
        return;
      }

      try {
        await API.createEmployeeNote(emp.id, { note_date: date, content, tag });
        notes = await API.getEmployeeNotes(emp.id);
        toast('✅ Nota guardada', 'success');
        refresh();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    // Delete Notes
    document.querySelectorAll('.note-del-btn').forEach(btn => {
      btn.onclick = async () => {
        const noteId = btn.dataset.id;
        const confirm = await Modal.confirm('Eliminar nota', '¿Estás seguro de que quieres eliminar esta anotación?');
        if (!confirm) return;

        try {
          await API.deleteEmployeeNote(noteId);
          notes = await API.getEmployeeNotes(emp.id);
          toast('Nota eliminada', 'info');
          _showNotesModal(emp);
        } catch (e) {
          toast(e.message, 'error');
        }
      };
    });

    // Calendar day clicks (set form date)
    document.querySelectorAll('.mini-cal-day').forEach(cell => {
      cell.onclick = () => {
        const date = cell.dataset.date;
        if (date) {
          document.getElementById('new-note-date').value = date;
          document.querySelectorAll('.mini-cal-day').forEach(c => c.classList.remove('active-date'));
          cell.classList.add('active-date');
        }
      };
    });
  };

  const refresh = () => {
    document.getElementById('notes-modal-wrapper').innerHTML = renderContent();
    attachEvents();
  };

  attachEvents();
}
