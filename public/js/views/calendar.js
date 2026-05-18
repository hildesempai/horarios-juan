/* views/calendar.js — Calendario histórico de libres, 24h y doble turno */

let _currentYear = new Date().getFullYear();
let _currentMonth = new Date().getMonth(); // 0-indexed
let _selectedType = 'off_days'; // 'off_days', 'shifts_24h', 'double_shifts'

async function renderCalendarView(container) {
  container.innerHTML = `<div class="page"><div class="spinner" style="margin:4rem auto;display:block"></div></div>`;

  try {
    const [employees, publishedData] = await Promise.all([
      API.getEmployees(true),
      API.getPublishedEntries()
    ]);

    const activeEmployees = employees.filter(e => e.active);

    _renderCalendarFrame(container, activeEmployees, publishedData);
  } catch (e) {
    container.innerHTML = `<div class="page"><div class="alert alert-danger">❌ Error al cargar calendario histórico: ${e.message}</div></div>`;
    console.error(e);
  }
}

function _renderCalendarFrame(container, employees, data) {
  // HTML de estilos integrados (quirúrgico y autodocumentado)
  const styles = `
    <style>
      .calendar-container {
        display: flex;
        flex-direction: column;
        gap: var(--sp-4);
      }
      .calendar-layout {
        display: grid;
        grid-template-columns: 3fr 1fr;
        gap: var(--sp-4);
      }
      @media (max-width: 1024px) {
        .calendar-layout {
          grid-template-columns: 1fr;
        }
      }
      .calendar-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: var(--bg-700);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: var(--sp-4);
        flex-wrap: wrap;
        gap: var(--sp-3);
      }
      .calendar-filters-group {
        display: flex;
        align-items: center;
        gap: var(--sp-3);
      }
      .calendar-type-tabs {
        display: flex;
        gap: var(--sp-2);
        background: var(--bg-800);
        padding: 4px;
        border-radius: var(--radius-full);
        border: 1px solid var(--border-md);
      }
      .calendar-type-tab {
        background: transparent;
        border: none;
        border-radius: var(--radius-full);
        padding: var(--sp-2) var(--sp-4);
        color: var(--text-300);
        font-weight: 600;
        font-size: var(--text-sm);
        cursor: pointer;
        transition: all var(--transition);
      }
      .calendar-type-tab:hover {
        color: var(--text-100);
      }
      .calendar-type-tab.active {
        background: var(--accent);
        color: #fff;
        box-shadow: 0 2px 8px var(--accent-glow);
      }
      .calendar-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 6px;
        background: var(--bg-800);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: var(--sp-3);
      }
      .calendar-header-day {
        text-align: center;
        font-weight: 700;
        font-size: var(--text-xs);
        color: var(--text-300);
        text-transform: uppercase;
        padding: var(--sp-2) 0;
        letter-spacing: 0.05em;
      }
      .calendar-cell {
        background: var(--bg-700);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        min-height: 90px;
        padding: var(--sp-2);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        transition: background var(--transition);
        position: relative;
      }
      .calendar-cell:hover {
        background: var(--bg-600);
      }
      .calendar-cell.other-month {
        opacity: 0.25;
        pointer-events: none;
      }
      .calendar-cell-number {
        font-size: var(--text-sm);
        font-weight: 700;
        color: var(--text-300);
        text-align: right;
        margin-bottom: var(--sp-2);
      }
      .calendar-cell-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        align-content: flex-start;
      }
      .calendar-cell .emp-token {
        cursor: default;
        padding: 2px 6px;
        border-radius: var(--radius-sm);
        font-size: 10px;
        font-weight: 700;
      }
      .calendar-cell .emp-token:hover {
        transform: none;
        filter: none;
      }
      .stats-panel {
        background: var(--bg-700);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: var(--sp-4);
        display: flex;
        flex-direction: column;
        gap: var(--sp-4);
        height: fit-content;
      }
      .stats-title {
        font-size: var(--text-md);
        font-weight: 700;
        color: var(--text-100);
        border-bottom: 1px solid var(--border);
        padding-bottom: var(--sp-2);
      }
      .stats-list {
        display: flex;
        flex-direction: column;
        gap: var(--sp-2);
      }
      .stats-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--sp-2) var(--sp-3);
        background: var(--bg-600);
        border-radius: var(--radius-sm);
        font-size: var(--text-sm);
        border-left: 4px solid var(--emp-color);
      }
      .stats-item-name {
        font-weight: 600;
        color: var(--text-100);
      }
      .stats-item-value {
        font-weight: 700;
        color: var(--text-200);
        background: var(--bg-800);
        padding: 2px 8px;
        border-radius: var(--radius-full);
      }
    </style>
  `;

  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  // Años disponibles en base a los datos o actuales
  const years = [];
  const currentY = new Date().getFullYear();
  for (let y = currentY - 2; y <= currentY + 2; y++) {
    years.push(y);
  }

  const monthOptions = months.map((m, idx) =>
    `<option value="${idx}" ${idx === _currentMonth ? 'selected' : ''}>${m}</option>`
  ).join('');

  const yearOptions = years.map(y =>
    `<option value="${y}" ${y === _currentYear ? 'selected' : ''}>${y}</option>`
  ).join('');

  container.innerHTML = `
    ${styles}
    <div class="page calendar-container">
      <div class="page-header">
        <div>
          <div class="section-title">Calendario Histórico</div>
          <div class="section-subtitle">Consulta rápida de libres, dobles turnos y guardias 24h de cronogramas publicados</div>
        </div>
      </div>

      <!-- Controles de navegación y tipo de calendario -->
      <div class="calendar-controls">
        <div class="calendar-filters-group">
          <select id="cal-month" class="form-select" style="width:140px">${monthOptions}</select>
          <select id="cal-year" class="form-select" style="width:100px">${yearOptions}</select>
        </div>

        <div class="calendar-type-tabs">
          <button class="calendar-type-tab ${_selectedType === 'off_days' ? 'active' : ''}" data-type="off_days">🏖️ Libres</button>
          <button class="calendar-type-tab ${_selectedType === 'shifts_24h' ? 'active' : ''}" data-type="shifts_24h">🚨 Guardias 24h</button>
          <button class="calendar-type-tab ${_selectedType === 'double_shifts' ? 'active' : ''}" data-type="double_shifts">👥 Dobles</button>
        </div>
      </div>

      <!-- Layout principal -->
      <div class="calendar-layout">
        <div id="calendar-grid-container">
          <!-- Se inyectará el calendario -->
        </div>

        <div class="stats-panel" id="calendar-stats-container">
          <!-- Se inyectarán estadísticas -->
        </div>
      </div>
    </div>
  `;

  // Attach handlers
  document.getElementById('cal-month').addEventListener('change', e => {
    _currentMonth = Number(e.target.value);
    _updateCalendar(employees, data);
  });

  document.getElementById('cal-year').addEventListener('change', e => {
    _currentYear = Number(e.target.value);
    _updateCalendar(employees, data);
  });

  document.querySelectorAll('.calendar-type-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.calendar-type-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _selectedType = tab.dataset.type;
      _updateCalendar(employees, data);
    });
  });

  // Render inicial del calendario
  _updateCalendar(employees, data);
}

function _updateCalendar(employees, data) {
  const gridContainer = document.getElementById('calendar-grid-container');
  const statsContainer = document.getElementById('calendar-stats-container');

  const year = _currentYear;
  const month = _currentMonth;

  // Días de la semana para cabeceras
  const weekDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const dayHeadersHTML = weekDays.map(d => `<div class="calendar-header-day">${d}</div>`).join('');

  // Fechas del mes
  const firstDayOfMonth = new Date(year, month, 1);
  // Obtener desplazamiento (Monday=0, Sunday=6)
  let startOffset = firstDayOfMonth.getDay() - 1;
  if (startOffset < 0) startOffset = 6; // Sunday is index 6

  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
  const totalDaysInPrevMonth = new Date(year, month, 0).getDate();

  // Estructura de celdas
  const cells = [];

  // 1. Días del mes anterior
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = totalDaysInPrevMonth - i;
    cells.push({ dayNumber: d, isCurrentMonth: false });
  }

  // 2. Días del mes actual
  for (let d = 1; d <= totalDaysInMonth; d++) {
    cells.push({ dayNumber: d, isCurrentMonth: true });
  }

  // 3. Completar hasta múltiplos de 7 para cerrar la grilla
  const totalSlots = Math.ceil(cells.length / 7) * 7;
  const nextMonthDaysNeeded = totalSlots - cells.length;
  for (let d = 1; d <= nextMonthDaysNeeded; d++) {
    cells.push({ dayNumber: d, isCurrentMonth: false });
  }

  // Mapeo rápido de datos publicados del mes actual
  const monthStr = String(month + 1).padStart(2, '0');
  const datePrefix = `${year}-${monthStr}-`;

  // Agrupamiento por fecha y empleado
  // shiftCounts[date][employee_id] = count
  const shiftCounts = {};
  
  // Guardamos también qué periodos cubren qué fechas para saber si un día está "dentro de cronograma"
  const publishedDates = new Set();

  data.entries.forEach(entry => {
    const entryDate = entry.entry_date;
    publishedDates.add(entryDate);

    if (!shiftCounts[entryDate]) {
      shiftCounts[entryDate] = {};
    }
    if (!shiftCounts[entryDate][entry.employee_id]) {
      shiftCounts[entryDate][entry.employee_id] = 0;
    }
    shiftCounts[entryDate][entry.employee_id]++;
  });

  // Estadísticas mensuales
  const employeeStats = {};
  employees.forEach(emp => {
    employeeStats[emp.id] = { emp, count: 0 };
  });

  // Renderizar celdas
  const gridCellsHTML = cells.map(cell => {
    if (!cell.isCurrentMonth) {
      return `<div class="calendar-cell other-month"><div class="calendar-cell-number">${cell.dayNumber}</div></div>`;
    }

    const dayStr = String(cell.dayNumber).padStart(2, '0');
    const fullDateStr = `${datePrefix}${dayStr}`;
    const dayShiftCounts = shiftCounts[fullDateStr] || {};

    const matchedEmployees = [];

    // Validar si este día tiene cronogramas publicados que lo cubran
    const hasPublishedSchedules = publishedDates.has(fullDateStr);

    if (hasPublishedSchedules) {
      employees.forEach(emp => {
        const workedCount = dayShiftCounts[emp.id] || 0;

        if (_selectedType === 'off_days') {
          // Día Libre: Estaba activo pero trabajó 0 turnos en esta fecha publicada
          if (workedCount === 0) {
            matchedEmployees.push(emp);
            employeeStats[emp.id].count++;
          }
        } else if (_selectedType === 'shifts_24h') {
          // Guardia 24h: trabajó todos los turnos disponibles (generalmente 3)
          if (workedCount >= 3) {
            matchedEmployees.push(emp);
            employeeStats[emp.id].count++;
          }
        } else if (_selectedType === 'double_shifts') {
          // Doble Turno: trabajó exactamente 2 turnos
          if (workedCount === 2) {
            matchedEmployees.push(emp);
            employeeStats[emp.id].count++;
          }
        }
      });
    }

    const badgesHTML = matchedEmployees.map(emp => {
      const bg = hexToRgba(emp.color, 0.16);
      const bdr = hexToRgba(emp.color, 0.4);
      return `<span class="emp-token" style="background:${bg};border-color:${bdr};color:${emp.color}">${emp.abbreviation}</span>`;
    }).join('');

    // Si el día está fuera de cronograma, se pinta levemente distinto
    const cellClass = hasPublishedSchedules ? 'calendar-cell' : 'calendar-cell';
    const emptyMsg = hasPublishedSchedules ? '' : '<span style="font-size:8px;color:var(--text-400);position:absolute;left:8px;bottom:8px">Sin publicar</span>';

    return `
      <div class="${cellClass}">
        <div class="calendar-cell-number">${cell.dayNumber}</div>
        <div class="calendar-cell-badges">${badgesHTML}</div>
        ${emptyMsg}
      </div>
    `;
  }).join('');

  gridContainer.innerHTML = `
    <div class="calendar-grid">
      ${dayHeadersHTML}
      ${gridCellsHTML}
    </div>
  `;

  // Renderizar panel de estadísticas
  const typeLabels = {
    off_days: 'Días Libres',
    shifts_24h: 'Guardias 24h',
    double_shifts: 'Dobles Turnos'
  };

  const sortedStats = Object.values(employeeStats).sort((a, b) => b.count - a.count);

  const statsItemsHTML = sortedStats.map(stat => {
    return `
      <div class="stats-item" style="--emp-color: ${stat.emp.color}">
        <span class="stats-item-name">${stat.emp.name}</span>
        <span class="stats-item-value">${stat.count}</span>
      </div>
    `;
  }).join('');

  statsContainer.innerHTML = `
    <div class="stats-title">📊 Resumen: ${typeLabels[_selectedType]}</div>
    <div class="stats-list">
      ${statsItemsHTML.length ? statsItemsHTML : `<p style="color:var(--text-400);font-size:var(--text-sm);text-align:center;padding:var(--sp-4)">Sin registros publicados</p>`}
    </div>
  `;
}
