/**
 * Registro de los módulos de Apache ECharts que usa el producto.
 *
 * Se importan solo los componentes necesarios (`echarts/core` + piezas) en lugar del paquete
 * completo: el tablero de zona y el observatorio no necesitan los 60 tipos de gráfico, y el
 * mapa ya es lo bastante pesado.
 */
import { use } from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

let registered = false;

export function registerEcharts(): void {
  if (registered) return;
  use([
    BarChart,
    LineChart,
    PieChart,
    ScatterChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    TitleComponent,
    DataZoomComponent,
    MarkLineComponent,
    CanvasRenderer,
  ]);
  registered = true;
}

/** Paleta de series: secuencia con contraste suficiente entre vecinas y en escala de grises. */
export const CHART_PALETTE = [
  '#226352',
  '#b45309',
  '#1d4ed8',
  '#a4232b',
  '#7c3aed',
  '#0f766e',
  '#92400e',
  '#475569',
] as const;

/** Formateador de números en español de Colombia para ejes y tooltips. */
export function formatAxisNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} mil`;
  return value.toLocaleString('es-CO', { maximumFractionDigits: 1 });
}

/** Opciones comunes: fondo transparente, rejilla discreta y tooltip en español. */
export const BASE_CHART_OPTION = {
  backgroundColor: 'transparent',
  animationDuration: 300,
  grid: { left: 8, right: 12, top: 24, bottom: 8, containLabel: true },
  tooltip: { trigger: 'axis' as const, confine: true },
  textStyle: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12 },
} as const;
