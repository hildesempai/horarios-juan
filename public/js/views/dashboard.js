/* views/dashboard.js */
async function renderDashboard(container) {
  container.innerHTML = `<div class="page"><div class="spinner" style="margin:4rem auto;display:block"></div></div>`;

  const [periods, employees] = await Promise.all([
    API.getSchedules(),
    API.getActiveEmployees()
  ]).catch(() => [[], []]);

  const current = periods.find(p => p.status === 'published') || periods[0] || null;

  // ── Stats ──
  const totalPeriods  = periods.length;
  const publishedCount= periods.filter(p => p.status === 'published').length;
  const draftCount    = periods.filter(p => p.status === 'draft').length;
  const empCount      = employees.length;

  // ── Recent period info ──
  let periodHtml = '';
  if (current) {
    periodHtml = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Período activo</div>
            <div class="card-subtitle">${formatDateRange(current.start_date, current.end_date)}</div>
          </div>
          <span class="badge ${current.status === 'published' ? 'badge-success' : 'badge-warning'}">
            ${current.status === 'published' ? 'Publicado' : 'Borrador'}
          </span>
        </div>
        ${current.notes ? `<p style="font-size:var(--text-sm);color:var(--text-300);font-style:italic">"${current.notes}"</p>` : ''}
        <div style="margin-top:var(--sp-4);display:flex;gap:var(--sp-3)">
          <button class="btn btn-primary btn-sm" onclick="App.navigate('schedule')">
            📅 Ir al horario
          </button>
        </div>
      </div>`;
  } else {
    periodHtml = `
      <div class="card">
        <div style="text-align:center;padding:var(--sp-8);color:var(--text-400)">
          <div style="font-size:3rem;margin-bottom:var(--sp-4)">📅</div>
          <p>No hay períodos creados aún</p>
          <button class="btn btn-primary btn-sm" style="margin-top:var(--sp-4)"
            onclick="App.navigate('schedule')">
            ✨ Crear primer horario
          </button>
        </div>
      </div>`;
  }

  // ── Employee workload for current period ──
  let workloadHtml = '';
  if (current) {
    try {
      const detail = await API.getSchedule(current.id);
      const counts = {};
      employees.forEach(e => { counts[e.id] = { emp: e, count: 0 }; });
      detail.entries.forEach(e => { if (counts[e.employee_id]) counts[e.employee_id].count++; });

      const rows = Object.values(counts).map(({ emp, count }) => {
        const pct = Math.min((count / 14) * 100, 100);
        return `<div style="margin-bottom:var(--sp-3)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:var(--text-sm);font-weight:600;color:${emp.color}">${emp.name}</span>
            <span style="font-size:var(--text-xs);color:var(--text-400)">${count} turnos</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${emp.color}"></div></div>
        </div>`;
      }).join('');

      workloadHtml = `<div class="card"><div class="card-title" style="margin-bottom:var(--sp-4)">Carga de trabajo</div>${rows}</div>`;
    } catch (e) { workloadHtml = ''; }
  }

  // ── Upcoming off days ──
  let offHtml = '';
  if (current) {
    try {
      const detail = await API.getSchedule(current.id);
      const upcoming = detail.offBlocks
        .filter(b => b.block_type === 'regular' && b.start_date >= today())
        .sort((a,b) => a.start_date.localeCompare(b.start_date))
        .slice(0, 6);

      const items = upcoming.map(b => `
        <div style="display:flex;align-items:center;gap:var(--sp-3);padding:var(--sp-2) 0;border-bottom:1px solid var(--border)">
          <span style="font-size:1.2rem">🏖️</span>
          <div>
            <div style="font-size:var(--text-sm);font-weight:600;color:${b.color}">${b.emp_name}</div>
            <div style="font-size:var(--text-xs);color:var(--text-400)">${formatDateRange(b.start_date, b.end_date)}</div>
          </div>
        </div>`).join('');

      offHtml = items
        ? `<div class="card"><div class="card-title" style="margin-bottom:var(--sp-4)">Próximos descansos</div>${items}</div>`
        : '';
    } catch(e) { offHtml = ''; }
  }

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div class="page-header-left">
          <div class="section-title">Dashboard</div>
          <div class="section-subtitle">Resumen del sistema de horarios</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" onclick="App.navigate('schedule')">
            📅 Gestionar horarios
          </button>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card" style="--accent-color:var(--accent)">
          <div class="stat-icon">📅</div>
          <div class="stat-value">${totalPeriods}</div>
          <div class="stat-label">Períodos totales</div>
        </div>
        <div class="stat-card" style="--accent-color:var(--success)">
          <div class="stat-icon">✅</div>
          <div class="stat-value">${publishedCount}</div>
          <div class="stat-label">Publicados</div>
        </div>
        <div class="stat-card" style="--accent-color:var(--warning)">
          <div class="stat-icon">📝</div>
          <div class="stat-value">${draftCount}</div>
          <div class="stat-label">Borradores</div>
        </div>
        <div class="stat-card" style="--accent-color:var(--info)">
          <div class="stat-icon">👥</div>
          <div class="stat-value">${empCount}</div>
          <div class="stat-label">Empleados activos</div>
        </div>
      </div>

      <div class="two-col" style="gap:var(--sp-6)">
        <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
          ${periodHtml}
          ${workloadHtml}
        </div>
        <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
          ${offHtml || '<div class="card"><div style="text-align:center;padding:var(--sp-8);color:var(--text-400)">Sin períodos activos</div></div>'}
        </div>
      </div>
    </div>`;
}
