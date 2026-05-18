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
              <button class="btn btn-secondary btn-sm" onclick="_showEmpModal(${JSON.stringify(e).replace(/"/g,'&quot;')})">✏️</button>
              ${inactive
                ? `<button class="btn btn-success btn-sm" onclick="_reactivateEmp(${e.id})">↩️ Reactivar</button>`
                : `<button class="btn btn-danger btn-sm" onclick="_deactivateEmp(${e.id})">🚫</button>`
              }
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
