/* views/config.js — Configuración: turnos, SMTP, contraseña */

async function renderConfig(container) {
  container.innerHTML = `<div class="page"><div class="spinner" style="margin:4rem auto;display:block"></div></div>`;
  const [shiftTypes, settings] = await Promise.all([API.getShiftTypes(), API.getSettings()]);

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="section-title">Configuración</div>
          <div class="section-subtitle">Turnos, notificaciones y acceso</div>
        </div>
      </div>

      <!-- Configuración de turnos -->
      <div class="card" style="margin-bottom:var(--sp-6)">
        <div class="card-header">
          <div class="card-title">🕐 Tipos de turno</div>
          <button class="btn btn-primary btn-sm" onclick="_showShiftModal(null)">➕ Nuevo turno</button>
        </div>
        <table class="data-table">
          <thead><tr><th>Turno</th><th>Horario</th><th>Personal requerido</th><th>Genera descanso</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody id="shift-types-tbody">
            ${shiftTypes.map(s => _shiftRow(s)).join('')}
          </tbody>
        </table>
      </div>

      <!-- SMTP -->
      <div class="card" style="margin-bottom:var(--sp-6)">
        <div class="card-header">
          <div class="card-title">📧 Notificaciones por email (SMTP)</div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Servidor SMTP</label>
            <input id="smtp-host" class="form-input" value="${settings.smtp_host || ''}" placeholder="smtp.gmail.com" />
          </div>
          <div class="form-group">
            <label>Puerto</label>
            <input id="smtp-port" type="number" class="form-input" value="${settings.smtp_port || '587'}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Usuario / Email</label>
            <input id="smtp-user" type="email" class="form-input" value="${settings.smtp_user || ''}" placeholder="clinica@gmail.com" />
          </div>
          <div class="form-group">
            <label>Contraseña / App Password</label>
            <input id="smtp-pass" type="password" class="form-input" value="${settings.smtp_pass || ''}" placeholder="••••••••••••" />
          </div>
        </div>
        <div class="form-group">
          <label>Email remitente (From)</label>
          <input id="smtp-from" type="email" class="form-input" value="${settings.smtp_from || ''}" placeholder="Horarios Clínica <clinica@gmail.com>" />
          <span class="form-hint">Para Gmail: activa "App Passwords" en tu cuenta de Google y usa la contraseña generada</span>
        </div>
        <div style="display:flex;gap:var(--sp-3);margin-top:var(--sp-2)">
          <button id="btn-test-smtp" class="btn btn-secondary">🔌 Probar conexión</button>
          <button id="btn-save-smtp" class="btn btn-primary">💾 Guardar SMTP</button>
        </div>
        <div id="smtp-result" style="margin-top:var(--sp-3)"></div>
      </div>

      <!-- Variables globales -->
      <div class="card" style="margin-bottom:var(--sp-6)">
        <div class="card-header">
          <div class="card-title">⚙️ Variables globales</div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Duración del período (días)</label>
            <input id="period-days" type="number" min="7" max="31" class="form-input" value="${settings.period_days || '15'}" />
            <span class="form-hint">Por defecto: 15 días</span>
          </div>
          <div class="form-group">
            <label>Turnos por semana por persona</label>
            <input id="shifts-week" type="number" min="1" max="21" class="form-input" value="${settings.shifts_per_week || '7'}" />
            <span class="form-hint">Para balanceo de carga</span>
          </div>
        </div>
        <button id="btn-save-global" class="btn btn-primary">💾 Guardar variables</button>
      </div>

      <!-- Contraseña admin -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">🔐 Cambiar contraseña admin</div>
        </div>
        <div class="form-row-3">
          <div class="form-group">
            <label>Contraseña actual</label>
            <input id="pass-current" type="password" class="form-input" placeholder="••••••" />
          </div>
          <div class="form-group">
            <label>Nueva contraseña</label>
            <input id="pass-new" type="password" class="form-input" placeholder="••••••" />
          </div>
          <div class="form-group">
            <label>Confirmar nueva</label>
            <input id="pass-confirm" type="password" class="form-input" placeholder="••••••" />
          </div>
        </div>
        <button id="btn-change-pass" class="btn btn-primary">🔐 Cambiar contraseña</button>
        <div id="pass-result" style="margin-top:var(--sp-3)"></div>
      </div>
    </div>`;

  // ── SMTP handlers ──
  document.getElementById('btn-save-smtp').onclick = async () => {
    const data = {
      smtp_host: document.getElementById('smtp-host').value,
      smtp_port: document.getElementById('smtp-port').value,
      smtp_user: document.getElementById('smtp-user').value,
      smtp_pass: document.getElementById('smtp-pass').value,
      smtp_from: document.getElementById('smtp-from').value,
    };
    await API.updateSettings(data);
    toast('✅ SMTP guardado', 'success');
  };

  document.getElementById('btn-test-smtp').onclick = async () => {
    const btn = document.getElementById('btn-test-smtp');
    setLoading(btn, true);
    const resultEl = document.getElementById('smtp-result');
    try {
      const r = await API.testSmtp();
      resultEl.innerHTML = `<div class="alert alert-success">✅ ${r.message}</div>`;
    } catch(e) {
      resultEl.innerHTML = `<div class="alert alert-danger">❌ ${e.message}</div>`;
    } finally { setLoading(btn, false); }
  };

  // ── Global vars handler ──
  document.getElementById('btn-save-global').onclick = async () => {
    await API.updateSettings({
      period_days:    document.getElementById('period-days').value,
      shifts_per_week: document.getElementById('shifts-week').value,
    });
    toast('✅ Variables guardadas', 'success');
  };

  // ── Password handler ──
  document.getElementById('btn-change-pass').onclick = async () => {
    const cur = document.getElementById('pass-current').value;
    const nw  = document.getElementById('pass-new').value;
    const cnf = document.getElementById('pass-confirm').value;
    const resultEl = document.getElementById('pass-result');
    if (!cur || !nw) return toast('Rellena todos los campos', 'warning');
    if (nw !== cnf) return toast('Las contraseñas nuevas no coinciden', 'warning');
    try {
      await API.changePassword(cur, nw);
      resultEl.innerHTML = `<div class="alert alert-success">✅ Contraseña cambiada correctamente</div>`;
      document.getElementById('pass-current').value = '';
      document.getElementById('pass-new').value = '';
      document.getElementById('pass-confirm').value = '';
    } catch(e) {
      resultEl.innerHTML = `<div class="alert alert-danger">❌ ${e.message}</div>`;
    }
  };
}

function _shiftRow(s) {
  return `<tr id="shift-row-${s.id}">
    <td style="font-weight:600">${s.name}</td>
    <td style="color:var(--text-300)">${s.start_time} – ${s.end_time}</td>
    <td><span class="badge badge-accent">${s.required_staff} persona(s)</span></td>
    <td><span class="badge badge-${s.triggers_next_day_off ? 'warning' : 'muted'}">${s.triggers_next_day_off ? '✓ Sí' : 'No'}</span></td>
    <td><span class="badge badge-${s.active ? 'success' : 'muted'}">${s.active ? 'Activo' : 'Inactivo'}</span></td>
    <td>
      <div style="display:flex;gap:var(--sp-2)">
        <button class="btn btn-secondary btn-sm" onclick="_showShiftModal(${JSON.stringify(s).replace(/"/g,'&quot;')})">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="_deleteShift(${s.id})">🗑️</button>
      </div>
    </td>
  </tr>`;
}

function _showShiftModal(shift) {
  const isNew = !shift;
  Modal.open(isNew ? 'Nuevo tipo de turno' : `Editar: ${shift?.name}`, `
    <div class="form-row">
      <div class="form-group">
        <label>Nombre del turno</label>
        <input id="shift-name" class="form-input" value="${shift?.name || ''}" placeholder="Ej: Noche" />
      </div>
      <div class="form-group">
        <label>Personal requerido</label>
        <input id="shift-staff" type="number" min="1" max="10" class="form-input" value="${shift?.required_staff || 1}" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Hora inicio (HH:MM)</label>
        <input id="shift-start" class="form-input" value="${shift?.start_time || '08:00'}" placeholder="08:00" />
      </div>
      <div class="form-group">
        <label>Hora fin (HH:MM)</label>
        <input id="shift-end" class="form-input" value="${shift?.end_time || '14:00'}" placeholder="14:00" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Orden de visualización</label>
        <input id="shift-order" type="number" class="form-input" value="${shift?.sort_order || 1}" />
      </div>
    </div>
    <label class="toggle-wrap" style="margin-top:var(--sp-2)">
      <div id="shift-dayoff" class="toggle ${shift?.triggers_next_day_off ? 'active' : ''}"></div>
      <span style="font-size:var(--text-sm)">Genera descanso al día siguiente (ej: turno nocturno)</span>
    </label>`,
    `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
     <button id="btn-save-shift" class="btn btn-primary">${isNew ? '➕ Crear' : '💾 Guardar'}</button>`
  );

  document.getElementById('shift-dayoff').onclick = function() { this.classList.toggle('active'); };

  document.getElementById('btn-save-shift').onclick = async () => {
    const data = {
      name:                 document.getElementById('shift-name').value.trim(),
      required_staff:       Number(document.getElementById('shift-staff').value),
      start_time:           document.getElementById('shift-start').value,
      end_time:             document.getElementById('shift-end').value,
      sort_order:           Number(document.getElementById('shift-order').value),
      triggers_next_day_off: document.getElementById('shift-dayoff').classList.contains('active') ? 1 : 0,
      active: 1
    };
    if (!data.name) return toast('Nombre requerido', 'warning');
    const btn = document.getElementById('btn-save-shift');
    setLoading(btn, true);
    try {
      if (isNew) await API.createShiftType(data);
      else       await API.updateShiftType(shift.id, data);
      Modal.close();
      await renderConfig(document.getElementById('view-container'));
      toast(isNew ? '✅ Turno creado' : '✅ Turno actualizado', 'success');
    } catch(e) { toast(e.message, 'error'); setLoading(btn, false); }
  };
}

async function _deleteShift(id) {
  const ok = await Modal.confirm('Eliminar turno', '¿Eliminar este tipo de turno? Solo es posible si no tiene entradas en horarios existentes.');
  if (!ok) return;
  try {
    await API.deleteShiftType(id);
    await renderConfig(document.getElementById('view-container'));
    toast('Turno eliminado', 'info');
  } catch(e) { toast(e.message, 'error'); }
}
