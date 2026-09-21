/**
 * Filtro de PII del crawler (regla 3 de CLAUDE.md).
 *
 * Aplica `etl/config/pii-blocklist.ts` sobre los campos declarados por la fuente
 * y sobre los valores de las muestras, y deja registro estructurado de cada
 * descarte para `data-catalog/PII_DESCARTES.md`.
 *
 * Importante: el filtro se aplica ANTES de escribir nada a disco. Una columna de
 * la lista negra nunca llega al catálogo, ni siquiera con el valor vacío.
 */

import {
  classifyPiiColumn,
  detectPiiContent,
  isPiiAdjacentColumn,
  redactValue,
} from '@terracolombia/etl-config';
import type { CatalogField, PiiDiscardRecord, SourceId } from './types.js';

export interface PiiContext {
  source: SourceId;
  /** Servicio o dataset. */
  container: string;
  /** Capa o tabla. */
  layer: string;
}

/**
 * Acumula los descartes de toda la corrida. Se instancia una vez por ejecución
 * del crawler y se vuelca al final.
 */
export class PiiLog {
  private readonly records: PiiDiscardRecord[] = [];

  add(record: Omit<PiiDiscardRecord, 'detectedAt'>): void {
    this.records.push({ ...record, detectedAt: new Date().toISOString() });
  }

  get all(): readonly PiiDiscardRecord[] {
    return this.records;
  }

  get droppedCount(): number {
    return this.records.filter((r) => r.action === 'dropped').length;
  }

  get redactedCount(): number {
    return this.records.filter((r) => r.action === 'redacted').length;
  }

  /** Descartes agrupados por columna normalizada, para la tabla del informe. */
  groupByColumn(): { column: string; ruleId: string; reason: string; occurrences: PiiDiscardRecord[] }[] {
    const map = new Map<string, { column: string; ruleId: string; reason: string; occurrences: PiiDiscardRecord[] }>();
    for (const r of this.records) {
      const key = `${r.column.toLowerCase()}|${r.ruleId}`;
      const entry = map.get(key) ?? {
        column: r.column,
        ruleId: r.ruleId,
        reason: r.reason,
        occurrences: [],
      };
      entry.occurrences.push(r);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.occurrences.length - a.occurrences.length);
  }

  merge(other: PiiLog): void {
    this.records.push(...other.all);
  }
}

/**
 * Clasifica los campos declarados por la fuente. Devuelve la lista completa
 * (incluidas las columnas PII, marcadas), porque el catálogo debe documentar
 * QUÉ se descartó, no ocultarlo: lo que nunca se guarda son los valores.
 */
export function classifyFields<T extends { name: string }>(
  fields: readonly T[],
  ctx: PiiContext,
  log: PiiLog,
  map: (field: T, verdict: { pii: boolean; ruleId: string | null; reason: string | null }) => CatalogField,
): CatalogField[] {
  return fields.map((field) => {
    const verdict = classifyPiiColumn(field.name);
    if (verdict.pii) {
      log.add({
        source: ctx.source,
        container: ctx.container,
        layer: ctx.layer,
        column: field.name,
        detectedBy: 'column-name',
        ruleId: verdict.ruleId,
        reason: verdict.reason,
        action: 'dropped',
      });
      return map(field, { pii: true, ruleId: verdict.ruleId, reason: verdict.reason });
    }
    return map(field, { pii: false, ruleId: null, reason: null });
  });
}

export interface SanitizeResult {
  rows: Record<string, unknown>[];
  droppedColumns: string[];
  redactedColumns: string[];
}

/**
 * Limpia una muestra de registros:
 *  1. Elimina toda columna que la lista negra marque por nombre.
 *  2. Redacta los valores que la heurística de contenido detecte.
 *
 * El descarte por nombre se decide una sola vez por columna sobre el conjunto de
 * claves de toda la muestra, para que el resultado sea estable aunque una fila
 * traiga la columna vacía y otra no.
 */
export function sanitizeSample(
  rows: readonly Record<string, unknown>[],
  ctx: PiiContext,
  log: PiiLog,
): SanitizeResult {
  const allKeys = new Set<string>();
  for (const row of rows) for (const k of Object.keys(row)) allKeys.add(k);

  const dropped = new Set<string>();
  for (const key of allKeys) {
    const verdict = classifyPiiColumn(key);
    if (verdict.pii) {
      dropped.add(key);
      log.add({
        source: ctx.source,
        container: ctx.container,
        layer: ctx.layer,
        column: key,
        detectedBy: 'column-name',
        ruleId: verdict.ruleId,
        reason: verdict.reason,
        action: 'dropped',
      });
    }
  }

  const redacted = new Set<string>();
  const clean: Record<string, unknown>[] = [];
  for (const row of rows) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (dropped.has(key)) continue;
      const hit = detectPiiContent(value, key);
      if (hit) {
        if (!redacted.has(key)) {
          redacted.add(key);
          log.add({
            source: ctx.source,
            container: ctx.container,
            layer: ctx.layer,
            column: key,
            detectedBy: 'content-heuristic',
            ruleId: hit.patternId,
            reason: hit.reason,
            action: 'redacted',
          });
        }
        out[key] = redactValue(value, hit.patternId);
        continue;
      }
      out[key] = value;
    }
    clean.push(out);
  }

  return {
    rows: clean,
    droppedColumns: [...dropped].sort(),
    redactedColumns: [...redacted].sort(),
  };
}

/**
 * Columnas "adyacentes" a PII presentes en una capa (matrícula inmobiliaria, FMI).
 * No se descartan, pero se listan en el informe: si la fuente las publica junto a
 * titularidad hay que revisar el dataset completo antes de ingerirlo.
 */
export function findPiiAdjacentColumns(fieldNames: readonly string[]): string[] {
  return fieldNames.filter((n) => isPiiAdjacentColumn(n));
}

export { classifyPiiColumn, detectPiiContent, redactValue };
