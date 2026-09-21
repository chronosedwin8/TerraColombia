/**
 * Tipos compartidos por el sistema de diseño.
 * Viven fuera de los SFC porque `<script setup>` no admite exportaciones.
 */

/** Estados de `FactorScore.flag` y de `SuitabilityResult.verdict`, unificados. */
export type SemaphoreStatus =
  | 'ok'
  | 'caution'
  | 'blocker'
  | 'unknown'
  | 'favorable'
  | 'condicionado'
  | 'desfavorable'
  | 'sin_datos';

export interface TabItem {
  id: string;
  label: string;
  /** Contador opcional a la derecha de la etiqueta. */
  badge?: string | number;
  disabled?: boolean;
}

/** Acciones de la barra fija de resultados (PLAN.md §10.1). */
export type ResultAction = 'save' | 'compare' | 'export' | 'share';
