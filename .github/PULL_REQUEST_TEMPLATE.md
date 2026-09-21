<!--
  Plantilla de pull request de TerraColombia.
  Borre las secciones que no apliquen, pero NO borre la lista de verificación
  de reglas: esas diez reglas (CLAUDE.md) son las que impiden que el producto
  se convierta en algo que no queremos publicar.
-->

## Qué cambia

<!-- Una o dos frases en lenguaje claro. Si no se puede resumir así, el PR
     probablemente hace demasiadas cosas. -->

## Por qué

<!-- Problema que resuelve, o fase y entregable del PLAN al que corresponde. -->

**Fase del plan:** <!-- p. ej. Fase 2 — ETL catastro piloto · o "mantenimiento" -->

**Cierra:** <!-- #123 · o "ninguna incidencia" -->

## Cómo probarlo

<!-- Pasos concretos. Quien revise tiene que poder verificarlo sin preguntar. -->

```bash
# ejemplo
pnpm db:migrate && pnpm db:seed
pnpm dev
# abrir http://localhost:5173/predio/... y comprobar que ...
```

---

## Reglas del proyecto (CLAUDE.md)

Marque lo que aplica. Si algo no aplica, escriba «n/a» y por qué.

- [ ] **R2 · Nada inventado.** Todo campo, capa o URL de fuente externa sale de
      una inspección real registrada en `data-catalog/`. Lo que no existe está
      marcado `NO_DISPONIBLE`, no simulado.
- [ ] **R3 · Cero datos personales.** Ninguna columna nueva puede llevar a una
      persona. Si la fuente traía PII, está en `etl/config/pii-blocklist.ts` y
      se registra al descartarla. No se abre ninguna ruta predio → persona.
- [ ] **R4 · Procedencia.** Toda cifra que se muestra lleva fuente, dataset,
      fecha de corte y licencia. Ninguna respuesta de API devuelve datos sin su
      bloque `meta.sources[]`.
- [ ] **R5 · Avalúo ≠ valor comercial.** Todo dato económico catastral va con
      esa advertencia.
- [ ] **R6 · Cobertura honesta.** Si el municipio no es jurisdicción del IGAC o
      no tiene datos, la interfaz lo dice; no hay mapas vacíos sin explicación.
- [ ] **R7 · Sin secretos.** No hay credenciales, llaves ni contraseñas en
      archivos versionados. Las variables nuevas están en `.env.example` con
      valor de ejemplo, no real.
- [ ] **R8 · Geometría en SQL crudo.** Prisma solo toca el esquema `app`.
- [ ] **R9 · Idioma.** Interfaz, informes y mensajes de error en español
      (Colombia); código e identificadores en inglés.
- [ ] **R10 · Decisiones registradas.** Las decisiones técnicas que no eran
      obvias están en `docs/DECISIONES.md`.

## Calidad

- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm test` pasan en local.
- [ ] Hay tests para lo que se añadió o corrigió (y el test falla sin el cambio).
- [ ] TypeScript estricto: ningún `any` nuevo sin comentario que lo justifique.
- [ ] Sin concatenación de cadenas hacia SQL: solo los constructores
      parametrizados de `packages/db/src/sql.ts`.
- [ ] Validación Zod en todo borde nuevo (ruta HTTP, trabajo de cola, entrada
      de ETL).

## Base de datos

- [ ] No aplica.
- [ ] Hay migración versionada en `packages/db/migrations`.
- [ ] La migración es **compatible hacia atrás**: se puede aplicar con la
      versión anterior del código todavía corriendo (columnas nuevas antes de
      usarlas; eliminarlas en un despliegue posterior).
- [ ] La reversión está documentada o escrita.
- [ ] Índices nuevos para toda columna geométrica (GiST) y para toda columna que
      se filtre.
- [ ] La semilla del municipio piloto sigue cargando (`pnpm db:seed`).

## Rendimiento (objetivos de PLAN §13)

- [ ] No aplica.
- [ ] Ficha de predio < 800 ms p95.
- [ ] Tesela < 200 ms p95 con caché.
- [ ] Análisis de zona ≤ 5 km² < 5 s.
- [ ] Informe PDF < 60 s.
- [ ] Se revisó el `EXPLAIN ANALYZE` de las consultas nuevas o modificadas.

## Interfaz (si toca `apps/web`)

- [ ] Divulgación progresiva: resumen → secciones plegables → detalle → dato
      crudo con fuente.
- [ ] Todo término técnico nuevo tiene entrada en el glosario y *tooltip*.
- [ ] Los semáforos llevan texto, no solo color. Contraste WCAG AA.
- [ ] Funciona en móvil (panel inferior deslizable sobre el mapa).
- [ ] El estado relevante está en la URL: la vista se puede compartir.
- [ ] Estados vacíos honestos: dicen qué falta y por qué.

## Infraestructura y despliegue

- [ ] No aplica.
- [ ] Variables de entorno nuevas documentadas en `.env.example`.
- [ ] `docs/OPERACION.md` actualizado si cambia la puesta en marcha o la operación.
- [ ] Si cambia una imagen de Docker, sigue corriendo sin privilegios de root.
- [ ] Si añade una métrica, hay panel o alerta que la use (o se explica por qué no).

## Capturas o salida

<!-- Para cambios de interfaz: antes y después. Para informes: el PDF.
     Para ETL: el informe de carga con conteos y validaciones. -->

## Riesgos y qué vigilar después de fusionar

<!-- ¿Qué puede salir mal? ¿Qué métrica o alerta hay que mirar?
     Si la respuesta es "nada", escríbalo: es una respuesta válida. -->
