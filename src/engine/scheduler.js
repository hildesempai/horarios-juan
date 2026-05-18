/**
 * scheduler.js — Motor de generación automática de horarios clínicos
 *
 * REGLAS DE NEGOCIO (verificadas con el usuario):
 * R1. 5 empleados titulares (+ suplentes opcionales).
 * R2. Foráneos: 3 días libres CONSECUTIVOS por período de 14 días.
 * R3. Locales:  2 días libres (pueden o no ser consecutivos) por período.
 * R4. 7 turnos por semana = 14 turnos por persona en período de 14 días.
 * R5. Turno doble/24h: priorizar foráneos (Diego, Milagros).
 * R6. 24h (3 turnos en un día) = día siguiente libre OBLIGATORIO.
 * R7. Nocturno solo = día siguiente libre SOLO SI ES POSIBLE (preferible, no obligatorio).
 * R8. Llenado sin huecos garantizado (Pase 3 forzoso si es necesario).
 */

'use strict';

const MAX_SHIFTS_PER_WEEK = 7;

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

/** Cuenta turnos de un empleado en una semana específica (7 días) */
function weekShiftCount(entries, empId, weekDates) {
  return entries.filter(e => e.employee_id === empId && weekDates.includes(e.entry_date)).length;
}

/** Determina en qué semana (0 o 1) cae una fecha dentro del período */
function getWeekIndex(date, allDates) {
  const idx = allDates.indexOf(date);
  return Math.floor(idx / 7);
}

/**
 * Genera el horario completo para un período dado.
 */
function generateSchedule({ startDate, endDate, employees, shiftTypes, lockedEntries = [], requested_off_days = {} }) {
  const dates    = getDatesInPeriod(startDate, endDate);
  const warnings = [];
  const entries  = [];
  const offBlocks = [];

  const shiftsSorted = [...shiftTypes].sort((a, b) => a.sort_order - b.sort_order);
  const nightShifts  = shiftsSorted.filter(s => s.triggers_next_day_off);
  const nightShiftIds = new Set(nightShifts.map(s => s.id));
  const totalShiftsPerDay = shiftsSorted.reduce((sum, s) => sum + s.required_staff, 0);

  // Separar semanas
  const week1Dates = dates.slice(0, 7);
  const week2Dates = dates.slice(7, 14);

  const workCount = new Map(employees.map(e => [e.id, 0]));

  // Identificar foráneos (para priorizar en turnos dobles/24h)
  const foraneoIds = new Set(employees.filter(e => e.type_id && (e.consecutive_off === 1 || (e.off_days && e.off_days >= 3))).map(e => e.id));

  // 1. Locked entries
  const lockedByDayShift = new Map();
  for (const le of lockedEntries) {
    const key = `${le.entry_date}|${le.shift_type_id}`;
    if (!lockedByDayShift.has(key)) lockedByDayShift.set(key, []);
    lockedByDayShift.get(key).push(le.employee_id);
    entries.push({ ...le, is_locked: 1 });
    workCount.set(le.employee_id, (workCount.get(le.employee_id) || 0) + 1);
  }

  // 2. Días libres solicitados por el usuario (manuales)
  const blockedDates = new Map(employees.map(e => [e.id, new Set()]));
  // Días bloqueados "blandos" (post-noche, preferible pero no obligatorio)
  const softBlockedDates = new Map(employees.map(e => [e.id, new Set()]));

  for (const emp of employees) {
    const reqOffs = requested_off_days[emp.id] || [];
    for (const d of reqOffs) {
      blockedDates.get(emp.id).add(d);
      offBlocks.push({
        employee_id: emp.id,
        start_date: d,
        end_date: d,
        block_type: 'regular'
      });
    }
  }

  // Detectar 24h en entradas locked → bloquear día siguiente OBLIGATORIO
  for (const emp of employees) {
    for (const date of dates) {
      const shiftsWorkedToday = lockedEntries
        .filter(le => le.entry_date === date && le.employee_id === emp.id)
        .map(le => le.shift_type_id);

      const did24h = shiftsWorkedToday.length >= shiftsSorted.length;
      const didNight = shiftsWorkedToday.some(sid => nightShiftIds.has(sid));

      if (did24h) {
        // R6: 24h = OBLIGATORIO día siguiente libre
        blockedDates.get(emp.id).add(addDays(date, 1));
      } else if (didNight) {
        // R7: Nocturno = PREFERIBLE día siguiente libre (bloqueo blando)
        softBlockedDates.get(emp.id).add(addDays(date, 1));
      }
    }
  }

  // 2.5 Auto-completar días libres según reglas del empleado
  for (const emp of employees) {
    const requiredOff = emp.off_days || 0;
    const needsConsecutive = emp.consecutive_off === 1 && requiredOff >= 3; // Solo foráneos con 3+ días
    let currentOffs = Array.from(blockedDates.get(emp.id)).filter(d => dates.includes(d));
    let missingOffs = requiredOff - currentOffs.length;

    if (missingOffs > 0) {
      if (needsConsecutive) {
        // R2: Foráneos necesitan bloque CONSECUTIVO de 3 días
        let bestScore = Infinity;
        let bestStartIdx = -1;

        for (let i = 0; i <= dates.length - missingOffs; i++) {
          let score = 0;
          let valid = true;
          for (let j = 0; j < missingOffs; j++) {
            const d = dates[i + j];
            if (blockedDates.get(emp.id).has(d)) {
              valid = false;
              break;
            }
            // Penalizar días donde ya hay mucha gente libre
            for (const [, set] of blockedDates.entries()) {
              if (set.has(d)) score++;
            }
          }
          if (valid && score < bestScore) {
            bestScore = score;
            bestStartIdx = i;
          }
        }

        if (bestStartIdx !== -1) {
          for (let j = 0; j < missingOffs; j++) {
            const d = dates[bestStartIdx + j];
            blockedDates.get(emp.id).add(d);
            offBlocks.push({ employee_id: emp.id, start_date: d, end_date: d, block_type: 'auto' });
          }
          missingOffs = 0;
        }
      }

      // R3: Locales o fallback — días sueltos donde menos gente descansa
      if (missingOffs > 0) {
        const candidateDays = dates.filter(d => !blockedDates.get(emp.id).has(d));
        candidateDays.sort((a, b) => {
          let offA = 0, offB = 0;
          for (const [, set] of blockedDates.entries()) {
            if (set.has(a)) offA++;
            if (set.has(b)) offB++;
          }
          return offA - offB;
        });

        for (let i = 0; i < missingOffs && i < candidateDays.length; i++) {
          const d = candidateDays[i];
          blockedDates.get(emp.id).add(d);
          offBlocks.push({ employee_id: emp.id, start_date: d, end_date: d, block_type: 'auto' });
        }
      }
    }
  }

  // 3. Asignación Día por Día
  for (const date of dates) {
    const weekIdx = getWeekIndex(date, dates);
    const weekDates = weekIdx === 0 ? week1Dates : week2Dates;

    for (const shift of shiftsSorted) {
      const dayShiftKey   = `${date}|${shift.id}`;
      const alreadyLocked = lockedByDayShift.get(dayShiftKey) || [];
      const slotsToFill   = shift.required_staff - alreadyLocked.length;

      if (slotsToFill <= 0) continue;

      const isNightShift = nightShiftIds.has(shift.id);
      let position = alreadyLocked.length + 1;
      let filled   = 0;

      // ── PASE 1: Candidatos ideales ──
      // No bloqueados, no han trabajado hoy, no exceden 7 turnos/semana
      let candidates = employees.filter(emp => {
        if (blockedDates.get(emp.id).has(date)) return false;
        if (softBlockedDates.get(emp.id).has(date)) return false; // Preferir evitar post-noche
        const workedToday = entries.some(e => e.entry_date === date && e.employee_id === emp.id);
        if (workedToday) return false;
        // R4: Máximo 7 turnos por semana
        if (weekShiftCount(entries, emp.id, weekDates) >= MAX_SHIFTS_PER_WEEK) return false;
        return true;
      }).sort((a, b) => {
          const aShiftsNeeded = MAX_SHIFTS_PER_WEEK - weekShiftCount(entries, a.id, weekDates);
          const bShiftsNeeded = MAX_SHIFTS_PER_WEEK - weekShiftCount(entries, b.id, weekDates);
          
          let aDaysLeft = 0;
          let bDaysLeft = 0;
          const todayIdx = weekDates.indexOf(date);
          for (let dIdx = todayIdx; dIdx < weekDates.length; dIdx++) {
            if (!blockedDates.get(a.id).has(weekDates[dIdx])) aDaysLeft++;
            if (!blockedDates.get(b.id).has(weekDates[dIdx])) bDaysLeft++;
          }
          
          const aCriticality = aShiftsNeeded - aDaysLeft;
          const bCriticality = bShiftsNeeded - bDaysLeft;
          
          if (aCriticality !== bCriticality) return bCriticality - aCriticality;
          if (aDaysLeft !== bDaysLeft) return aDaysLeft - bDaysLeft;

        // Priorizar foráneos para turnos nocturnos
        if (isNightShift) {
          const aForaneo = foraneoIds.has(a.id) ? 0 : 1;
          const bForaneo = foraneoIds.has(b.id) ? 0 : 1;
          if (aForaneo !== bForaneo) return aForaneo - bForaneo;
        }
        return workCount.get(a.id) - workCount.get(b.id);
      });

      for (let i = 0; i < candidates.length && filled < slotsToFill; i++) {
        const emp = candidates[i];
        entries.push({ entry_date: date, shift_type_id: shift.id, employee_id: emp.id, position: position++, is_locked: 0 });
        workCount.set(emp.id, workCount.get(emp.id) + 1);
        filled++;
      }

      // ── PASE 1.5: Candidatos post-noche (bloqueo blando) ──
      // R7: Si no hay suficientes sin el bloqueo blando, usar los que tenían post-noche preferible
      if (filled < slotsToFill) {
        let softCandidates = employees.filter(emp => {
          if (blockedDates.get(emp.id).has(date)) return false; // Hard block = no
          if (!softBlockedDates.get(emp.id).has(date)) return false; // Solo los que estaban en bloqueo blando
          const workedToday = entries.some(e => e.entry_date === date && e.employee_id === emp.id);
          if (workedToday) return false;
          if (weekShiftCount(entries, emp.id, weekDates) >= MAX_SHIFTS_PER_WEEK) return false;
          return true;
        }).sort((a, b) => {
          const aShiftsNeeded = MAX_SHIFTS_PER_WEEK - weekShiftCount(entries, a.id, weekDates);
          const bShiftsNeeded = MAX_SHIFTS_PER_WEEK - weekShiftCount(entries, b.id, weekDates);
          
          let aDaysLeft = 0;
          let bDaysLeft = 0;
          const todayIdx = weekDates.indexOf(date);
          for (let dIdx = todayIdx; dIdx < weekDates.length; dIdx++) {
            if (!blockedDates.get(a.id).has(weekDates[dIdx])) aDaysLeft++;
            if (!blockedDates.get(b.id).has(weekDates[dIdx])) bDaysLeft++;
          }
          
          const aCriticality = aShiftsNeeded - aDaysLeft;
          const bCriticality = bShiftsNeeded - bDaysLeft;
          
          if (aCriticality !== bCriticality) return bCriticality - aCriticality;
          if (aDaysLeft !== bDaysLeft) return aDaysLeft - bDaysLeft;

          // Priorizar foráneos para turnos nocturnos
          if (isNightShift) {
            const aForaneo = foraneoIds.has(a.id) ? 0 : 1;
            const bForaneo = foraneoIds.has(b.id) ? 0 : 1;
            if (aForaneo !== bForaneo) return aForaneo - bForaneo;
          }
          return workCount.get(a.id) - workCount.get(b.id);
        });

        for (let i = 0; i < softCandidates.length && filled < slotsToFill; i++) {
          const emp = softCandidates[i];
          entries.push({ entry_date: date, shift_type_id: shift.id, employee_id: emp.id, position: position++, is_locked: 0 });
          workCount.set(emp.id, workCount.get(emp.id) + 1);
          filled++;
          warnings.push(`ℹ️ ${emp.name} trabaja el ${date} tras nocturno (sin 24h de descanso).`);
        }
      }

      // ── PASE 2: Turno extendido (doble turno diurno/nocturno) ──
      // R5: Priorizar foráneos para turnos dobles, pero asegurar que los locales lleguen a 7
      if (filled < slotsToFill) {
        let extCandidates = employees.filter(emp => {
          if (blockedDates.get(emp.id).has(date)) return false;
          if (entries.some(e => e.entry_date === date && e.shift_type_id === shift.id && e.employee_id === emp.id)) return false;
          if (entries.some(e => e.entry_date === date && nightShiftIds.has(e.shift_type_id) && e.employee_id === emp.id)) return false;
          if (weekShiftCount(entries, emp.id, weekDates) >= MAX_SHIFTS_PER_WEEK) return false;
          return true;
        });

        extCandidates.sort((a, b) => {
          // Calculate criticality: shifts needed vs days left
          const aShiftsNeeded = MAX_SHIFTS_PER_WEEK - weekShiftCount(entries, a.id, weekDates);
          const bShiftsNeeded = MAX_SHIFTS_PER_WEEK - weekShiftCount(entries, b.id, weekDates);
          
          let aDaysLeft = 0;
          let bDaysLeft = 0;
          const todayIdx = weekDates.indexOf(date);
          for (let dIdx = todayIdx; dIdx < weekDates.length; dIdx++) {
            if (!blockedDates.get(a.id).has(weekDates[dIdx])) aDaysLeft++;
            if (!blockedDates.get(b.id).has(weekDates[dIdx])) bDaysLeft++;
          }
          
          const aCriticality = aShiftsNeeded - aDaysLeft;
          const bCriticality = bShiftsNeeded - bDaysLeft;
          
          if (aCriticality !== bCriticality) return bCriticality - aCriticality; // Higher criticality first
          if (aDaysLeft !== bDaysLeft) return aDaysLeft - bDaysLeft; // Fewer days left first
          
          // R5: Foráneos primero para turnos dobles
          const aForaneo = foraneoIds.has(a.id) ? 0 : 1;
          const bForaneo = foraneoIds.has(b.id) ? 0 : 1;
          if (aForaneo !== bForaneo) return aForaneo - bForaneo;
          return workCount.get(a.id) - workCount.get(b.id);
        });

        for (let i = 0; i < extCandidates.length && filled < slotsToFill; i++) {
          const emp = extCandidates[i];
          entries.push({ entry_date: date, shift_type_id: shift.id, employee_id: emp.id, position: position++, is_locked: 0 });
          workCount.set(emp.id, workCount.get(emp.id) + 1);
          filled++;
        }
      }

      // ── PASE 3: Forzoso (ignora límite semanal si no hay otra forma) ──
      if (filled < slotsToFill) {
        let desperateCandidates = employees.filter(emp => {
          if (entries.some(e => e.entry_date === date && e.shift_type_id === shift.id && e.employee_id === emp.id)) return false;
          return true;
        }).sort((a, b) => {
          const aBlocked = blockedDates.get(a.id).has(date) ? 1 : 0;
          const bBlocked = blockedDates.get(b.id).has(date) ? 1 : 0;
          if (aBlocked !== bBlocked) return aBlocked - bBlocked;
          
          if (isNightShift) {
            const aForaneo = foraneoIds.has(a.id) ? 0 : 1;
            const bForaneo = foraneoIds.has(b.id) ? 0 : 1;
            if (aForaneo !== bForaneo) return aForaneo - bForaneo;
          }
          return workCount.get(a.id) - workCount.get(b.id);
        });

        for (let i = 0; i < desperateCandidates.length && filled < slotsToFill; i++) {
          const emp = desperateCandidates[i];
          entries.push({ entry_date: date, shift_type_id: shift.id, employee_id: emp.id, position: position++, is_locked: 0 });
          workCount.set(emp.id, workCount.get(emp.id) + 1);
          filled++;
          warnings.push(`⚠️ Forzoso: ${emp.name} el ${date} en ${shift.name} (excede límites).`);
        }
      }
    }

    // Calcular descansos dinámicos para días siguientes
    for (const emp of employees) {
      const shiftsToday = entries.filter(e => e.entry_date === date && e.employee_id === emp.id).map(e => e.shift_type_id);
      const didNightToday = shiftsToday.some(sid => nightShiftIds.has(sid));
      const did24hToday   = shiftsToday.length >= shiftsSorted.length;
      const tomorrow = addDays(date, 1);

      if (did24hToday) {
        // R6: 24h = OBLIGATORIO
        if (!blockedDates.get(emp.id).has(tomorrow)) {
          blockedDates.get(emp.id).add(tomorrow);
          offBlocks.push({ employee_id: emp.id, start_date: tomorrow, end_date: tomorrow, block_type: 'post_24h' });
        }
      } else if (didNightToday) {
        // R7: Nocturno = PREFERIBLE (bloqueo blando)
        if (!blockedDates.get(emp.id).has(tomorrow)) {
          softBlockedDates.get(emp.id).add(tomorrow);
        }
      }
    }
  }

  return { entries, offBlocks, warnings };
}

module.exports = { generateSchedule, getDatesInPeriod };
