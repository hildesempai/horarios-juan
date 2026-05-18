/* views/history.js — Historial de períodos */

async function renderHistory(container) {
  container.innerHTML = `<div class="page"><div class="spinner" style="margin:4rem auto;display:block"></div></div>`;
  const periods = await API.getSchedules().catch(() => []);

  if (!periods.length) {
    container.innerHTML = `<div class="page">
      <div class="page-header"><div class="section-title">Historial</div></div>
      ${emptyState('📂', 'No hay períodos guardados aún', `<button class="btn btn-primary" onclick="App.navigate('schedule')">Ir a Horarios</button>`)}
    </div>`;
    return;
  }

  // Group by year
  const byYear = {};
  periods.forEach(p => {
    const y = p.start_date.slice(0,4);
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(p);
  });

  const yearSections = Object.keys(byYear).sort((a,b) => b-a).map(year => `
    <div style="margin-bottom:var(--sp-6)">
      <div style="font-size:var(--text-lg);font-weight:800;color:var(--text-300);margin-bottom:var(--sp-3)">${year}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--sp-3)">
        ${byYear[year].map(p => `
          <div class="card card-sm" style="cursor:pointer;transition:transform .2s" onclick="_viewHistoryPeriod(${p.id})"
            onmouseenter="this.style.transform='translateY(-2px)'" onmouseleave="this.style.transform=''">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--sp-3)">
              <div>
                <div style="font-weight:700;color:var(--text-100)">${formatDate(p.start_date)} → ${formatDate(p.end_date)}</div>
                <div style="font-size:var(--text-xs);color:var(--text-400)">${p.entry_count || 0} turnos asignados</div>
              </div>
              <span class="badge ${p.status === 'published' ? 'badge-success' : p.status === 'draft' ? 'badge-warning' : 'badge-muted'}">
                ${p.status === 'published' ? 'Publicado' : p.status === 'draft' ? 'Borrador' : 'Archivado'}
              </span>
            </div>
            ${p.notes ? `<p style="font-size:var(--text-xs);color:var(--text-300);font-style:italic">"${p.notes}"</p>` : ''}
            <div style="font-size:var(--text-xs);color:var(--text-400);margin-top:var(--sp-2)">
              Creado: ${p.created_at?.slice(0,10) || '—'}
            </div>
          </div>`).join('')}
      </div>
    </div>`).join('');

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="section-title">Historial</div>
          <div class="section-subtitle">${periods.length} período(s) guardado(s)</div>
        </div>
      </div>
      ${yearSections}
    </div>`;
}

async function _viewHistoryPeriod(id) {
  const container = document.getElementById('view-container');
  container.innerHTML = `<div class="page"><div class="spinner" style="margin:4rem auto;display:block"></div></div>`;

  const detail = await API.getSchedule(id).catch(e => { toast(e.message, 'error'); return null; });
  if (!detail) return;

  const { period, entries, offBlocks } = detail;
  const employees  = await API.getActiveEmployees().catch(() => []);
  const shiftTypes = await API.getShiftTypes().catch(() => []);
  const empMap     = new Map(employees.map(e => [e.id, e]));

  // Stats
  const empCounts = {};
  employees.forEach(e => { empCounts[e.id] = 0; });
  entries.forEach(e => { if (empCounts[e.employee_id] !== undefined) empCounts[e.employee_id]++; });

  const statsHtml = employees.map(e => {
    const cnt = empCounts[e.id] || 0;
    const pct = Math.min((cnt/14)*100, 100);
    return `<div style="margin-bottom:var(--sp-3)">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:var(--text-sm);font-weight:600;color:${e.color}">${e.name}</span>
        <span style="font-size:var(--text-xs);color:var(--text-400)">${cnt} turnos</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${e.color}"></div></div>
    </div>`;
  }).join('');

  // Mini grid (full period, all days)
  const allDates = _getAllDates(period.start_date, period.end_date);
  const activeShifts = shiftTypes.filter(s => s.active).sort((a,b) => a.sort_order - b.sort_order);

  const gridRows = activeShifts.map(shift => {
    const cells = allDates.map(date => {
      const dayEntries = entries.filter(e => e.entry_date === date && e.shift_type_id === shift.id);
      const abbrs = dayEntries.map(e => `<span style="color:${e.color};font-weight:700;font-size:10px">${e.abbreviation}</span>`).join('<br>');
      return `<td style="padding:4px;border:1px solid var(--border);text-align:center;background:${shift.sort_order===1?'var(--shift-morning)':shift.sort_order===2?'var(--shift-afternoon)':'var(--shift-night)'}">${abbrs || '<span style="color:var(--text-400);font-size:9px">—</span>'}</td>`;
    }).join('');
    return `<tr>
      <td style="padding:4px 8px;border:1px solid var(--border);background:var(--bg-800);font-size:10px;font-weight:700;color:var(--text-300);white-space:nowrap">${shift.name}</td>
      ${cells}
    </tr>`;
  }).join('');

  const dateHeaders = allDates.map(d => `<th style="padding:4px 2px;border:1px solid var(--border);font-size:10px;text-align:center;background:var(--bg-700);color:var(--text-300)">${formatDate(d).slice(0,5)}<br><span style="font-weight:400;font-size:9px">${getDayName(d)}</span></th>`).join('');

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <button class="btn btn-ghost btn-sm" onclick="renderHistory(document.getElementById('view-container'))" style="margin-bottom:var(--sp-3)">← Volver al historial</button>
          <div class="section-title">${formatDateRange(period.start_date, period.end_date)}</div>
          <div class="section-subtitle">
            <span class="badge ${period.status === 'published' ? 'badge-success' : 'badge-warning'}">${period.status}</span>
            ${period.notes ? `&nbsp;&nbsp;"${period.notes}"` : ''}
          </div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="_archivePeriod(${period.id})">📦 Archivar</button>
          <button class="btn btn-primary btn-sm" onclick="App.navigate('schedule')">✏️ Editar</button>
        </div>
      </div>

      <div class="two-col" style="margin-bottom:var(--sp-6)">
        <div class="card"><div class="card-title" style="margin-bottom:var(--sp-4)">Carga de trabajo</div>${statsHtml}</div>
        <div class="card"><div class="card-title" style="margin-bottom:var(--sp-4)">Descansos del período</div>
          ${offBlocks.filter(b => b.block_type === 'regular').map(b => `
            <div style="display:flex;align-items:center;gap:var(--sp-3);padding:var(--sp-2) 0;border-bottom:1px solid var(--border)">
              <span style="font-weight:600;color:${b.color}">${b.emp_name}</span>
              <span style="font-size:var(--text-sm);color:var(--text-300)">${formatDateRange(b.start_date, b.end_date)}</span>
            </div>`).join('') || '<p style="color:var(--text-400);font-size:var(--text-sm)">Sin descansos registrados</p>'}
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="margin-bottom:var(--sp-4)">Vista completa del período</div>
        <div style="overflow-x:auto">
          <table style="border-collapse:collapse;width:100%;min-width:600px">
            <thead><tr><th style="padding:4px 8px;border:1px solid var(--border);background:var(--bg-800)"></th>${dateHeaders}</tr></thead>
            <tbody>${gridRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

async function _archivePeriod(id) {
  const ok = await Modal.confirm('Archivar período', '¿Archivar este período? Seguirá visible en el historial.');
  if (!ok) return;
  await API.setStatus(id, 'archived');
  await renderHistory(document.getElementById('view-container'));
  toast('📦 Período archivado', 'info');
}

function _getAllDates(start, end) {
  const dates = [];
  const cur = new Date(start + 'T00:00:00');
  const e   = new Date(end   + 'T00:00:00');
  while (cur <= e) { dates.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
  return dates;
}
