import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLOSSARY, type GlossaryEntry } from '@terracolombia/shared';

/**
 * Genera `guia/glosario.md` a partir de `GLOSSARY` de `@terracolombia/shared`.
 *
 * El glosario tiene una sola fuente: el paquete compartido. La web, la API, los informes y
 * esta documentación muestran exactamente el mismo texto, así que no puede pasar que la
 * documentación explique "zona homogénea" distinto de como la explica la ficha del predio.
 *
 * Se ejecuta antes de `vitepress dev` y de `vitepress build` (ver los scripts del paquete),
 * así que el archivo generado se puede regenerar en cualquier momento y no hay que editarlo
 * a mano.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(HERE, '..', 'guia', 'glosario.md');

/** Escapa los caracteres que Markdown interpretaría dentro de una celda de tabla. */
function escapeMarkdown(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** Ancla estable para poder enlazar un término desde la API y desde los informes. */
function anchorOf(entry: GlossaryEntry): string {
  return entry.id.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
}

function renderEntry(entry: GlossaryEntry): string {
  const lines: string[] = [];
  lines.push(`## ${entry.term} {#${anchorOf(entry)}}`);
  lines.push('');
  lines.push(entry.plain);
  lines.push('');
  if (entry.detail) {
    lines.push(entry.detail);
    lines.push('');
  }
  if (entry.source) {
    lines.push(`**Fuente del concepto:** ${entry.source}`);
    lines.push('');
  }
  lines.push(
    `**Identificador del término:** \`${entry.id}\`. Es el mismo en la web, en los informes y en ` +
      'el catálogo de [`GET /layers`](/referencia/capas), así que se puede usar para enlazar ' +
      'a esta definición desde tu propia interfaz.',
  );
  lines.push('');
  return lines.join('\n');
}

function renderIndexTable(entries: readonly GlossaryEntry[]): string {
  const rows = entries
    .map((e) => `| [${escapeMarkdown(e.term)}](#${anchorOf(e)}) | ${escapeMarkdown(e.plain)} |`)
    .join('\n');
  return ['| Término | En una línea |', '| --- | --- |', rows].join('\n');
}

async function main(): Promise<void> {
  const sorted = [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term, 'es-CO'));

  const content = `---
title: Glosario
description: Términos técnicos del territorio colombiano explicados en lenguaje claro.
---

<!--
  ARCHIVO GENERADO. No lo edites a mano.
  Fuente: packages/shared/src/glossary.ts (constante GLOSSARY).
  Regenerar: pnpm --filter @terracolombia/docs-site glossary
-->

# Glosario

Estos son los términos que aparecen en las respuestas de la API, en la web y en los informes.
La definición es **la misma en los tres sitios**: sale de \`GLOSSARY\` en
\`@terracolombia/shared\`, así que no hay dos versiones de la verdad.

Si un término técnico aparece en una respuesta y no está aquí, es un error nuestro:
escríbenos y lo agregamos.

${renderIndexTable(sorted)}

---

${sorted.map(renderEntry).join('\n---\n\n')}
## Qué no encontrarás en este glosario

- **Datos de personas.** La API no relaciona predios con propietarios, ni con documentos,
  teléfonos o direcciones personales. Esa ruta no existe en el producto.
- **Avalúos comerciales.** El avalúo catastral que se reporta es un valor fiscal.
  Ver [Avalúo catastral](#avaluo_catastral).
- **Conceptos jurídicos.** La API entrega indicadores territoriales, no conceptos de norma
  urbanística ni estudios de títulos. Ver [POT](#pot).

## De dónde sale cada definición

Los términos catastrales y agrológicos vienen del IGAC; los de población, del DANE; los de
ordenamiento, de la Ley 388 de 1997 y de los actos administrativos de cada municipio. La
columna **Fuente del concepto** de cada entrada lo dice.

${GLOSSARY.length} términos en total. Última generación: se regenera en cada compilación del
sitio, por lo que siempre coincide con la versión del código desplegada.
`;

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, content, 'utf8');
  console.log(`Glosario generado con ${GLOSSARY.length} términos en ${OUTPUT}`);
}

main().catch((error: unknown) => {
  console.error('No se pudo generar el glosario:', error);
  process.exitCode = 1;
});
