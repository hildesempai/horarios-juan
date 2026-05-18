/* utils.js — Helpers compartidos */

// ── Toast notifications ──────────────────────────────────────────────
function toast(msg, type = 'info', duration = 3500) {
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── Modal helpers ────────────────────────────────────────────────────
const Modal = {
  open(title, bodyHTML, footerHTML = '') {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    document.getElementById('modal-footer').innerHTML = footerHTML;
    document.getElementById('modal-overlay').classList.remove('hidden');
  },
  close() { document.getElementById('modal-overlay').classList.add('hidden'); },
  confirm(title, msg) {
    return new Promise(resolve => {
      const footer = `
        <button id="modal-cancel" class="btn btn-secondary">Cancelar</button>
        <button id="modal-confirm" class="btn btn-danger">Confirmar</button>`;
      Modal.open(title, `<p style="color:var(--text-200)">${msg}</p>`, footer);
      document.getElementById('modal-cancel').onclick  = () => { Modal.close(); resolve(false); };
      document.getElementById('modal-confirm').onclick = () => { Modal.close(); resolve(true); };
    });
  }
};
document.getElementById('modal-close').addEventListener('click', Modal.close);

// ── Date utilities ───────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}
function formatDateRange(start, end) {
  return `${formatDate(start)} → ${formatDate(end)}`;
}
function getDayName(dateStr) {
  const days = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  return days[new Date(dateStr + 'T00:00:00').getDay()];
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function today() { return new Date().toISOString().slice(0, 10); }
function isToday(dateStr) { return dateStr === today(); }

// Obtener fechas de una semana dentro de un período
function getWeekDates(startDate, weekIndex) {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    dates.push(addDays(startDate, weekIndex * 7 + i));
  }
  return dates;
}

// ── Color utilities ──────────────────────────────────────────────────
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Employee chip HTML ───────────────────────────────────────────────
function empChipHtml(emp, extra = '') {
  const bg  = hexToRgba(emp.color, 0.2);
  const bdr = hexToRgba(emp.color, 0.5);
  return `<span class="emp-token" style="background:${bg};border-color:${bdr};color:${emp.color}" data-emp-id="${emp.id}" ${extra}>
    ${emp.abbreviation}
  </span>`;
}

// ── Set loading state on button ──────────────────────────────────────
function setLoading(btn, loading) {
  if (loading) {
    btn.disabled = true;
    btn._originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn._originalText || btn.innerHTML;
  }
}

// ── Generate default period dates (15 days from today) ───────────────
function defaultPeriodDates() {
  const start = today();
  const end   = addDays(start, 14);
  return { start, end };
}

// ── Debounce ─────────────────────────────────────────────────────────
function debounce(fn, delay = 400) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

// ── Render empty state ───────────────────────────────────────────────
function emptyState(icon, text, btnHtml = '') {
  return `<div class="empty-state">
    <div class="empty-state-icon">${icon}</div>
    <div class="empty-state-text">${text}</div>
    ${btnHtml ? `<div style="margin-top:1.5rem">${btnHtml}</div>` : ''}
  </div>`;
}
