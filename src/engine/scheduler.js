/**
 * scheduler.js — Algoritmo de generación automática de horarios
 *
 * REGLAS DE NEGOCIO (definitivas):
 * 1. required_staff personas por turno (configurable por turno).
 * 2. ~7 turnos/persona/semana (14 por período de 15 días).
 * 3. Días libres según tipo de empleado: local=2, foráneo=3 (consecutivos).
 * 4. Turno de 24h = mismas 3 franjas (Mañana+Tarde+Noche) en el mismo día.
 *    → El día SIGUIENTE es obligatoriamente libre.
 * 5. Post-turno-nocturno: al terminar un bloque de noches, el siguiente día
 *    es libre (24h de descanso mínimo garantizado).
 * 6. Nadie trabaja en su día libre (bloques regulares ni post-noche).
 * 7. Si no hay candidatos suficientes: se emite warning pero NO se deja vacío
 *    si algún empleado puede hacer turno extra (mañana+tarde mismo día).
 */

'use strict';

function getDatesInPeriod(startDate, endDate) {
  const dates = [];
  const cur   = new Date(startDate + 'T00:00:00');
  const end   = new Date(endDate   + 'T00:00:00');
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
 */
function generateSchedule({ startDate, endDate, employees, shiftTypes, lockedEntries = [] }) {
  const dates    = getDatesInPeriod(startDate, endDate);
  const warnings = [];
  const entries  = [];  // { entry_date, shift_type_id, employee_id, position, is_locked }
  const offBlocks = []; // { employee_id, start_date, end_date, block_type }

  // ── Ordenar turnos por sort_order (Mañana < Tarde < Noche) ──────────────
  const shiftsSorted = [...shiftTypes].sort((a, b) => a.sort_order - b.sort_order);
  const nightShifts  = shiftsSorted.filter(s => s.triggers_next_day_off);
  const nightShiftIds = new Set(nightShifts.map(s => s.id));

  // Carga de trabajo por empleado
  const workCount = new Map(employees.map(e => [e.id, 0]));

  // ── Incorporar entradas locked ───────────────────────────────────────────
  const lockedByDayShift = new Map(); // `date|shiftId` → [employeeIds]
  for (const le of lockedEntries) {
    const key = `${le.entry_date}|${le.shift_type_id}`;
    if (!lockedByDayShift.has(key)) lockedByDayShift.set(key, []);
    lockedByDayShift.get(key).push(le.employee_id);
    entries.push({ ...le, is_locked: 1 });
    workCount.set(le.employee_id, (workCount.get(le.employee_id) || 0) + 1);
  }

  // ── PASO 1: Detectar 24h en entradas locked ─────────────────────────────
  // Un empleado con locked en los 3 turnos del mismo día = turno 24h → bloquear siguiente
  const blockedDates = new Map(employees.map(e => [e.id, new Set()]));

  for (const emp of employees) {
    for (const date of dates) {
      const shiftsWorkedToday = lockedEntries
        .filter(le => le.entry_date === date && le.employee_id === emp.id)
        .map(le => le.shift_type_id);

      // Si tiene los 3 turnos = 24h → siguiente día libre
      if (shiftsWorkedToday.length >= 3 || (
        shiftsWorkedToday.length > 0 &&
        shiftsWorkedToday.some(sid => nightShiftIds.has(sid)) &&
        shiftsWorkedToday.length >= shiftsSorted.length
      )) {
        const tomorrow = addDays(date, 1);
        blockedDates.get(emp.id).add(tomorrow);
      }
      // Si tiene turno nocturno locked → bloquear siguiente también
      if (shiftsWorkedToday.some(sid => nightShiftIds.has(sid))) {
        blockedDates.get(emp.id).add(addDays(date, 1));
      }
    }
  }

  // ── PASO 2: Asignar bloques de días libres (regulares) ──────────────────
  // Ordenar: foráneos primero (más días libres = más restrictivos)
  const empsSorted = [...employees].sort((a, b) => b.off_days - a.off_days);

  for (const emp of empsSorted) {
    const offDays = emp.off_days || 2;
    const blocked = blockedDates.get(emp.id);

    // Buscar el bloque de `offDays` días consecutivos con menor conflicto
    // (es decir, que no coincida con otros empleados de libre el mismo día)
    let bestStart = null;
    let bestScore = Infinity;

    for (let i = 0; i <= dates.length - offDays; i++) {
      // No empezar en días ya bloqueados para este empleado
      const candidate = dates.slice(i, i + offDays);
      if (candidate.some(d => blocked.has(d))) continue;

      // Score: cuántos otros empleados libres esos días (queremos minimizar)
      let score = 0;
      for (const d of candidate) {
        for (const [eid, bs] of blockedDates) {
          if (eid !== emp.id && bs.has(d)) score++;
        }
      }
      // Leve penalización para distribuir a lo largo del período
      score += i * 0.05;

      if (score < bestScore) {
        bestScore = score;
        bestStart = i;
      }
    }

    if (bestStart === null) {
      warnings.push(`⚠️ No se pudo asignar bloque de días libres a ${emp.name}`);
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

  // ── PASO 3: Llenar turnos día a día ─────────────────────────────────────
  // Rastreo de noches por empleado para detectar fin de bloque nocturno
  const didNightPrevDay = new Map(employees.map(e => [e.id, false]));
  // Rastreo de "fue turno 24h ayer" → siguiente libre
  const did24hYesterday = new Map(employees.map(e => [e.id, false]));

  for (const date of dates) {

    // Aplicar bloqueos de descanso que ya se calcularon
    // (blockedDates ya contiene los días post-noche/post-24h de locked)
    // No hace falta re-añadir aquí; la comprobación es directa sobre blockedDates

    for (const shift of shiftsSorted) {
      const dayShiftKey   = `${date}|${shift.id}`;
      const alreadyLocked = lockedByDayShift.get(dayShiftKey) || [];
      const slotsToFill   = shift.required_staff - alreadyLocked.length;

      if (slotsToFill <= 0) continue;

      // Empleados ya asignados a este turno este día
      const assignedThisShift = new Set(
        entries
          .filter(e => e.entry_date === date && e.shift_type_id === shift.id)
          .map(e => e.employee_id)
      );

      // Empleados ya asignados a CUALQUIER turno de este día
      const assignedThisDay = new Set(
        entries
          .filter(e => e.entry_date === date)
          .map(e => e.employee_id)
      );

      // ¿Es turno nocturno?
      const isNightShift = nightShiftIds.has(shift.id);

      const candidates = employees.filter(emp => {
        // Bloqueado por libre o post-noche/post-24h
        if (blockedDates.get(emp.id).has(date)) return false;
        // Ya asignado a este turno exacto
        if (assignedThisShift.has(emp.id)) return false;
        // Turno nocturno: no asignar a quien ya trabajó en CUALQUIER turno hoy
        // (no hacemos nocturno si ya hizo mañana o tarde, a menos que sea 24h explícito)
        if (isNightShift && assignedThisDay.has(emp.id)) return false;
        return true;
      });

      // Ordenar por menor carga de trabajo
      candidates.sort((a, b) => workCount.get(a.id) - workCount.get(b.id));

      let position = alreadyLocked.length + 1;
      let filled   = 0;

      for (let i = 0; i < candidates.length && filled < slotsToFill; i++) {
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
        filled++;
      }

      // Si aún faltan slots: intentar reutilizar empleados que ya trabajaron
      // un turno NO nocturno hoy (turno extendido Mañana+Tarde)
      if (filled < slotsToFill && !isNightShift) {
        const extendedCandidates = employees.filter(emp => {
          if (blockedDates.get(emp.id).has(date)) return false;
          if (assignedThisShift.has(emp.id)) return false;
          // Solo permitir si quien ya trabajó hoy lo hizo en turno NO nocturno
          const alreadyWorkedShifts = entries
            .filter(e => e.entry_date === date && e.employee_id === emp.id)
            .map(e => e.shift_type_id);
          if (alreadyWorkedShifts.length === 0) return false; // ya cubiertos arriba
          if (alreadyWorkedShifts.some(sid => nightShiftIds.has(sid))) return false;
          return true;
        }).sort((a, b) => workCount.get(a.id) - workCount.get(b.id));

        for (let i = 0; i < extendedCandidates.length && filled < slotsToFill; i++) {
          const emp = extendedCandidates[i];
          entries.push({
            entry_date:    date,
            shift_type_id: shift.id,
            employee_id:   emp.id,
            position:      position++,
            is_locked:     0,
            is_day_off:    0,
            is_rest_after_night: 0
          });
          workCount.set(emp.id, workCount.get(emp.id) + 1);
          filled++;
        }
      }

      if (filled < slotsToFill) {
        warnings.push(`⚠️ ${date} | ${shift.name}: ${filled}/${shift.required_staff} cubiertos (sin candidatos disponibles)`);
      }
    }

    // ── Post-proceso: detectar 24h y fin de bloque nocturno ─────────────────
    for (const emp of employees) {
      const shiftsToday = entries
        .filter(e => e.entry_date === date && e.employee_id === emp.id)
        .map(e => e.shift_type_id);

      const didNightToday = shiftsToday.some(sid => nightShiftIds.has(sid));
      const did24hToday   = shiftsToday.length >= shiftsSorted.length; // Trabajó TODOS los turnos del día

      const tomorrow = addDays(date, 1);

      // REGLA 24H: si hizo todos los turnos hoy → mañana libre
      if (did24hToday) {
        if (!blockedDates.get(emp.id).has(tomorrow)) {
          blockedDates.get(emp.id).add(tomorrow);
          // Solo añadir bloque si no existe ya uno que cubra ese día
          const alreadyHasBlock = offBlocks.some(
            b => b.employee_id === emp.id && b.start_date <= tomorrow && b.end_date >= tomorrow
          );
          if (!alreadyHasBlock) {
            offBlocks.push({
              employee_id: emp.id,
              start_date:  tomorrow,
              end_date:    tomorrow,
              block_type:  'post_night'
            });
          }
        }
      }
      // REGLA POST-NOCHE: si hizo noche ayer y HOY no hace noche → mañana libre
      else if (didNightPrevDay.get(emp.id) && !didNightToday) {
        if (!blockedDates.get(emp.id).has(date)) {
          // El descanso es HOY (ya salió del bloque), lo marcamos
          // (date ya está procesado, así que bloqueamos el día de hoy en el sentido
          // de que no recibe más asignaciones — y tomorrow si aplica)
          blockedDates.get(emp.id).add(tomorrow);
          const alreadyHasBlock = offBlocks.some(
            b => b.employee_id === emp.id && b.start_date <= tomorrow && b.end_date >= tomorrow
          );
          if (!alreadyHasBlock) {
            offBlocks.push({
              employee_id: emp.id,
              start_date:  tomorrow,
              end_date:    tomorrow,
              block_type:  'post_night'
            });
          }
        }
      }

      didNightPrevDay.set(emp.id, didNightToday);
      did24hYesterday.set(emp.id, did24hToday);
    }
  }

  // ── PASO 4: Validar balance final ────────────────────────────────────────
  const totalDays  = dates.length;
  const weeks      = totalDays / 7;
  const expected   = Math.round(7 * weeks); // ~14 para 15 días

  for (const emp of employees) {
    const count = workCount.get(emp.id);
    if (Math.abs(count - expected) > 3) {
      warnings.push(`⚠️ Balance: ${emp.name} tiene ${count} turnos (esperado ~${expected})`);
    }
  }

  return { entries, offBlocks, warnings };
}

module.exports = { generateSchedule, getDatesInPeriod };
