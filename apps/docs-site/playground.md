---
title: Playground
description: Probar los endpoints de la GeoAPI de TerraColombia desde el navegador con tu propia llave.
---

# Playground

Prueba un endpoint con tu llave, sin escribir código.

::: warning Tu llave se queda en tu navegador
Esta página guarda la llave únicamente en el `sessionStorage` de tu navegador —se borra al cerrar
la pestaña— y la envía **solo** a la API de TerraColombia. No la manda a este sitio de
documentación ni a ningún tercero.

Aun así: **usa una llave de sandbox**. Nunca pegues una llave de producción en una página web,
tampoco en esta. Ver [Autenticación](/guia/autenticacion#donde-no-poner-la-llave).
:::

<div id="tc-playground" class="tc-pg">
  <noscript>
    <p>El playground necesita JavaScript. Sin él, usa los ejemplos con <code>curl</code> de cada
    página de la <a href="/referencia/">referencia</a>.</p>
  </noscript>
</div>

<style>
.tc-pg { margin: 1.5rem 0; font-size: 0.95rem; }
.tc-pg fieldset { border: 1px solid var(--vp-c-divider); border-radius: 8px; padding: 1rem; margin: 0 0 1rem; }
.tc-pg legend { font-weight: 600; padding: 0 .4rem; }
.tc-pg label { display: block; font-weight: 600; margin: .75rem 0 .3rem; }
.tc-pg label:first-of-type { margin-top: 0; }
.tc-pg input[type="text"], .tc-pg input[type="password"], .tc-pg select, .tc-pg textarea {
  width: 100%; padding: .5rem .6rem; border: 1px solid var(--vp-c-divider);
  border-radius: 6px; background: var(--vp-c-bg); color: var(--vp-c-text-1);
  font-family: inherit; font-size: .9rem; box-sizing: border-box;
}
.tc-pg textarea { font-family: var(--vp-font-family-mono); min-height: 7rem; resize: vertical; }
.tc-pg .tc-hint { font-weight: 400; font-size: .8rem; color: var(--vp-c-text-2); margin: .25rem 0 0; }
.tc-pg .tc-row { display: flex; gap: .75rem; flex-wrap: wrap; align-items: center; margin-top: 1rem; }
.tc-pg button {
  padding: .55rem 1.1rem; border-radius: 6px; border: 1px solid var(--vp-c-brand-1);
  background: var(--vp-c-brand-1); color: #fff; font-weight: 600; cursor: pointer; font-size: .9rem;
}
.tc-pg button[disabled] { opacity: .55; cursor: progress; }
.tc-pg button.tc-secondary { background: transparent; color: var(--vp-c-brand-1); }
.tc-pg .tc-status { font-family: var(--vp-font-family-mono); font-size: .85rem; }
.tc-pg .tc-ok { color: #0ca30c; }
.tc-pg .tc-err { color: #d03b3b; }
.tc-pg pre {
  background: var(--vp-c-bg-alt); border: 1px solid var(--vp-c-divider); border-radius: 8px;
  padding: .9rem; overflow: auto; max-height: 26rem; font-size: .82rem; margin: .5rem 0 0;
}
.tc-pg .tc-meta { border-left: 3px solid var(--vp-c-brand-1); padding: .6rem .8rem; background: var(--vp-c-bg-alt); border-radius: 0 6px 6px 0; margin-top: .75rem; }
.tc-pg .tc-meta h4 { margin: 0 0 .4rem; font-size: .85rem; text-transform: uppercase; letter-spacing: .04em; color: var(--vp-c-text-2); }
.tc-pg .tc-meta ul { margin: 0; padding-left: 1.1rem; font-size: .84rem; }
.tc-pg .tc-warn { border-left-color: #fab219; }
.tc-pg .tc-demo { border-left-color: #d03b3b; font-weight: 600; }
.tc-pg .tc-curl { font-size: .78rem; }
.tc-pg .tc-hidden { display: none; }
.tc-pg .tc-inline { display: inline; }
.tc-pg select { width: 100%; }
</style>

<script setup>
// Toda la lógica vive en .vitepress/theme/playground.ts: el contenido de un archivo Markdown
// se compila como plantilla de Vue, y las cadenas con HTML dentro del bloque <script>
// confunden al compilador de componentes de un solo archivo.
import { onMounted } from 'vue';
import { mountPlayground } from './.vitepress/playground';

onMounted(() => mountPlayground());
</script>

## Si el playground no funciona

| Síntoma | Causa probable |
| --- | --- |
| «Fallo de red» sin código HTTP | CORS: el origen de esta documentación no está permitido en tu llave. Añádelo en **Cuenta → Llaves de API → Orígenes permitidos**, o usa `curl` |
| `401` | La llave está mal copiada, revocada, o le sobran espacios |
| `403` | A la llave le falta el ámbito de ese endpoint, o tu plan no incluye la función |
| `429` | Te pasaste del límite por minuto. Espera lo que diga `Retry-After` |
| `402` | Se agotaron los créditos o el cupo del periodo |

Ver [Errores](/guia/errores) para la tabla completa.

## Lo que hace esta página

- Guarda tu llave en `sessionStorage`, que se borra al cerrar la pestaña.
- La envía **solo** a la URL base que ves en el formulario.
- Muestra el bloque `meta` por separado, para que te acostumbres a leerlo.
- El botón «Copiar como curl» escribe `$TC_API_KEY` en lugar de tu llave, para que puedas pegar
  el comando en cualquier sitio sin filtrarla.

## Después del playground

- [Inicio rápido](/guia/inicio-rapido) — el mismo recorrido, con código
- [Referencia](/referencia/) — todos los endpoints con sus campos
- [SDK de JavaScript](/guia/sdk-js) — cliente tipado
- [Licencias y atribución](/guia/licencias-y-atribucion) — antes de publicar nada
