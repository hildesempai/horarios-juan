/**
 * scheduler.js — Algoritmo de generación automática de horarios
 * 
 * Restricciones implementadas:
 * 1. required_staff personas por turno (configurable por turno)
 * 2. ~7 turnos/persona/semana (14 por período de 15 días)
 * 3. Días libres según tipo: local=2, foráneo=3 (consecutivos)
 * 4. Post-24h: día libre ADICIONAL al siguiente
 * 5. Post-bloque-nocturno: 24h libres al salir del bloque
 * 6. No asignar a quien está de descanso
 */

'use strict';

/**
 * Genera todas las fechas de un período como strings YYYY-MM-DD
 */
function getDatesInPeriod(startDate, endDate) {
  const dates = [];
  const cur = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Genera el horario completo para un período dado.
 * @param {Object} params
 * @param {string} params.startDate  - 'YYYY-MM-DD'
 * @param {string} params.endDate    - 'YYYY-MM-DD'
 * @param {Array}  params.employees  - [{id, name, abbreviation, off_days, consecutive_off, color, ...}]
 * @param {Array}  params.shiftTypes - [{id, name, required_staff, triggers_next_day_off, sort_order}]
 * @param {Array}  params.lockedEntries - entradas ya fijadas manualmente [{entry_date, shift_type_id, employee_id, position}]
 * @returns {Object} { entries: [], offBlocks: [], warnings: [] }
 */
function generateSchedule({ startDate, endDate, employees, shiftTypes, lockedEntries = [] }) {
  const dates     = getDatesInPeriod(startDate, endDate);
  const warnings  = [];
  const entries   = []; // { entry_date, shift_type_id, employee_id, position, is_locked }
  const offBlocks = []; // { employee_id, start_date, end_date, block_type }

  // ── Índices de utilidad ──────────────────────────────────────────────────
  const shiftsSorted = [...shiftTypes].sort((a, b) => a.sort_order - b.sort_order);
  const nightShifts  = shiftsSorted.filter(s => s.triggers_next_day_off);
  
  // Mapa: employee_id → datos
  const empMap = new Map(employees.map(e => [e.id, e]));

  // Turno laboral count por empleado
  const workCount = new Map(employees.map(e => [e.id, 0]));

  // Conjunto de (date + shiftTypeId + empId) para locked
  const lockedSet  = new Set(lockedEntries.map(e => `${e.entry_date}|${e.shift_type_id}|${e.position}`));
  const lockedByDayShift = new Map(); // `date|shiftId` → [employeeIds]
  for (const le of lockedEntries) {
    const key = `${le.entry_date}|${le.shift_type_id}`;
    if (!lockedByDayShift.has(key)) lockedByDayShift.set(key, []);
    lockedByDayShift.get(key).push(le.employee_id);
    entries.push({ ...le, is_locked: 1 });
    workCount.set(le.employee_id, (workCount.get(le.employee_id) || 0) + 1);
  }

  // ── PASO 1: Asignar bloques de días libres ───────────────────────────────
  // Estado: dateSet bloqueado por empleado
  const empBlockedDates = new Map(employees.map(e => [e.id, new Set()]));

  // Para evitar que todos estén libres el mismo día, distribuimos los bloques
  // Ordenamos: foráneos primero (más días libres = más restrictivos)
  const empsSorted = [...employees].sort((a, b) => b.off_days - a.off_days);

  for (const emp of empsSorted) {
    const offDays  = emp.off_days || 2;
    const blocked  = empBlockedDates.get(emp.id);

    // Encontrar un bloque de `offDays` días consecutivos que:
    // - No tenga demasiados otros empleados libres el mismo día
    // - Esté dentro del período
    let bestStart = null;
    let bestScore = Infinity;

    for (let i = 0; i <= dates.length - offDays; i++) {
      const candidate = dates.slice(i, i + offDays);
      // Score: cuántos otros empleados ya están libres en esos días (menor = mejor)
      let score = 0;
      for (const d of candidate) {
        for (const [eid, bs] of empBlockedDates) {
          if (eid !== emp.id && bs.has(d)) score++;
        }
      }
      // Penalizar si el bloque empieza demasiado tarde (queremos repartir en el período)
      score += i * 0.01;
      if (score < bestScore) {
        bestScore = score;
        bestStart = i;
      }
    }

    if (bestStart === null) {
      warnings.push(`No se pudo asignar bloque de días libres a ${emp.name}`);
      continue;
    }

    const offBlock = dates.slice(bestStart, bestStart + offDays);
    for (const d of offBlock) blocked.add(d);
    offBlocks.push({
      employee_id: emp.id,
      start_date:  offBlock[0],
      end_date:    offBlock[offBlock.length - 1],
      block_type:  'regular'
    });
  }

  // ── PASO 2: Llenar turnos ────────────────────────────────────────────────
  // Procesamos turno por turno, día por día
  // Para distribución equitativa usamos round-robin con penalización por workCount

  // Estado de descanso post-noche: empId → fecha hasta la que está bloqueado
  const postNightBlock = new Map(employees.map(e => [e.id, null]));
  // Rastrear si alguien hizo noche ayer para detectar "salida del bloque"
  const didNightYesterday = new Map(employees.map(e => [e.id, false]));

  for (const date of dates) {
    // Marcar post-noche: quienes salen del bloque nocturno hoy deben estar libres
    for (const emp of employees) {
      const blockUntil = postNightBlock.get(emp.id);
      if (blockUntil && date <= blockUntil) {
        empBlockedDates.get(emp.id).add(date);
      }
    }

    // Procesar cada tipo de turno en orden (Mañana → Tarde → Noche)
    for (const shift of shiftsSorted) {
      const dayShiftKey = `${date}|${shift.id}`;
      const alreadyLocked = lockedByDayShift.get(dayShiftKey) || [];
      const slotsToFill   = shift.required_staff - alreadyLocked.length;

      if (slotsToFill <= 0) continue;

      // Candidatos: activos, no bloqueados hoy, no ya asignados a este día/turno
      const assignedToday = new Set(
        entries
          .filter(e => e.entry_date === date && e.shift_type_id === shift.id)
          .map(e => e.employee_id)
      );
      const assignedThisDay = new Set(
        entries
          .filter(e => e.entry_date === date)
          .map(e => e.employee_id)
      );

      const candidates = employees.filter(emp => {
        if (empBlockedDates.get(emp.id).has(date)) return false;
        if (assignedToday.has(emp.id)) return false;
        // Para turnos nocturnos: no asignar a quien ya trabajó hoy en otro turno
        if (shift.triggers_next_day_off && assignedThisDay.has(emp.id)) return false;
        return true;
      });

      // Ordenar por carga de trabajo (menos turnos = prioridad)
      candidates.sort((a, b) => workCount.get(a.id) - workCount.get(b.id));

      let position = alreadyLocked.length + 1;
      for (let i = 0; i < slotsToFill && i < candidates.length; i++) {
        const emp = candidates[i];
        entries.push({
          entry_date:          date,
          shift_type_id:       shift.id,
          employee_id:         emp.id,
          position:            position++,
          is_locked:           0,
          is_day_off:          0,
          is_rest_after_night: 0
        });
        workCount.set(emp.id, workCount.get(emp.id) + 1);

        // Si es turno nocturno: marcar día siguiente como descanso post-noche
        if (shift.triggers_next_day_off) {
          // Verificamos si ya había hecho noche ayer (bloque continuo)
          // Si no la hizo ayer → está saliendo del bloque → bloquear mañana
          // Si la hizo ayer → sigue en bloque, no bloqueamos todavía
          const yesterday = addDays(date, -1);
          const wasNightYesterday = entries.some(
            e => e.entry_date === yesterday && e.shift_type_id === shift.id && e.employee_id === emp.id
          );
          if (!wasNightYesterday) {
            // Primera noche del bloque: no bloqueamos aún (puede encadenar)
            // Pero si la de mañana NO la asignamos → bloqueamos
          }
          // Marcar para procesar al día siguiente
          didNightYesterday.set(emp.id, true);
        }
      }

      if (candidates.length < slotsToFill) {
        warnings.push(`⚠️ ${date} turno ${shift.name}: solo ${candidates.length}/${shift.required_staff} cubiertos`);
      }
    }

    // Post-proceso: actualizar bloqueos post-noche
    for (const emp of employees) {
      const didNightToday = entries.some(
        e => e.entry_date === date && nightShifts.some(ns => ns.id === e.shift_type_id) && e.employee_id === emp.id
      );
      const tomorrow = addDays(date, 1);

      if (!didNightToday && didNightYesterday.get(emp.id)) {
        // Salió del bloque nocturno → libre mañana
        empBlockedDates.get(emp.id).add(tomorrow);
        postNightBlock.set(emp.id, tomorrow);
        offBlocks.push({
          employee_id: emp.id,
          start_date:  tomorrow,
          end_date:    tomorrow,
          block_type:  'post_night'
        });
      }
      didNightYesterday.set(emp.id, didNightToday);
    }
  }

  // ── PASO 3: Validar balance ──────────────────────────────────────────────
  const totalDays  = dates.length;
  const weeks      = totalDays / 7;
  for (const emp of employees) {
    const count    = workCount.get(emp.id);
    const expected = Math.round(7 * weeks); // ~14 para 15 días
    if (Math.abs(count - expected) > 2) {
      warnings.push(`⚠️ Balance: ${emp.name} tiene ${count} turnos (esperado ~${expected})`);
    }
  }

  return { entries, offBlocks, warnings };
}

module.exports = { generateSchedule, getDatesInPeriod };
