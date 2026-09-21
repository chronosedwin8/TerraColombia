/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TerraColombia — configuración de commits convencionales
 *
 * La regla 7 de `CLAUDE.md` exige commits convencionales. Esta configuración es
 * la que los verifica.
 *
 * ─── Por qué está aquí y no en la raíz ─────────────────────────────────────
 * Lo habitual sería `commitlint.config.js` en la raíz del repositorio, donde
 * las herramientas lo encuentran solas. Se pone en `.github/` porque el reparto
 * de trabajo de este proyecto asigna la raíz a otra persona; en cuanto se pueda
 * tocar la raíz, lo correcto es mover este archivo allí y borrar la opción
 * `--config` de los enganches. Mientras tanto, hay que pasar la ruta a mano.
 *
 * ─── Cómo engancharlo ──────────────────────────────────────────────────────
 *
 * 1. Dependencias (en la raíz del repositorio):
 *
 *      pnpm add -Dw @commitlint/cli @commitlint/config-conventional husky
 *
 * 2. Enganche local con husky (requiere tocar la raíz: `package.json` y
 *    `.husky/`). Añadir a los scripts de la raíz:
 *
 *      "prepare": "husky"
 *
 *    y crear `.husky/commit-msg` con:
 *
 *      pnpm exec commitlint --config .github/commitlint.config.js --edit "$1"
 *
 *    y `.husky/pre-commit` con:
 *
 *      pnpm exec lint-staged
 *
 * 3. Verificación en CI, sin depender de que cada persona tenga husky
 *    instalado. Añadir este job a `.github/workflows/ci.yml`:
 *
 *      commits:
 *        name: Commits convencionales
 *        runs-on: ubuntu-latest
 *        if: github.event_name == 'pull_request'
 *        steps:
 *          - uses: actions/checkout@v4
 *            with: { fetch-depth: 0 }
 *          - uses: pnpm/action-setup@v4
 *          - uses: actions/setup-node@v4
 *            with: { node-version: 22, cache: pnpm }
 *          - run: pnpm install --frozen-lockfile
 *          - name: Validar los mensajes del PR
 *            run: |
 *              pnpm exec commitlint \
 *                --config .github/commitlint.config.js \
 *                --from "${{ github.event.pull_request.base.sha }}" \
 *                --to "${{ github.event.pull_request.head.sha }}" \
 *                --verbose
 *
 *    (El enganche en CI es el que de verdad importa: husky se puede saltar con
 *    `--no-verify`, el job de CI no.)
 *
 * 4. Si se usa "Squash and merge", el mensaje del commit resultante es el
 *    título del PR: active en Settings → General → Pull Requests la opción de
 *    exigir título convencional, o añada la acción `amannn/action-semantic-pull-request`.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],

  rules: {
    // ─── Tipos permitidos ─────────────────────────────────────────────────
    // A los siete convencionales se añaden dos propios del proyecto:
    //   `data`  cambios en la definición o el mapeo de datasets del ETL, que no
    //           son ni función ni corrección: cambian lo que se ingiere.
    //   `legal` textos legales, advertencias, licencias y atribución. Se marcan
    //           aparte porque cualquier cambio ahí necesita revisión distinta
    //           (PLAN §2) y conviene poder encontrarlos todos en el historial.
    'type-enum': [
      2,
      'always',
      [
        'feat', // función nueva
        'fix', // corrección
        'docs', // documentación
        'style', // formato, sin cambio de comportamiento
        'refactor', // reestructuración sin cambio de comportamiento
        'perf', // rendimiento
        'test', // pruebas
        'build', // construcción, dependencias
        'ci', // integración continua
        'chore', // mantenimiento
        'revert', // revertir un commit
        'data', // datasets, mapeos de campos, validaciones de ingesta
        'legal', // advertencias, licencias, atribución
      ],
    ],

    // ─── Ámbitos ──────────────────────────────────────────────────────────
    // Corresponden a la estructura del repositorio (PLAN §4) más unos pocos
    // transversales. `scope-empty` queda permitido: obligar a poner ámbito en
    // un cambio que toca tres paquetes solo produce ámbitos falsos.
    'scope-enum': [
      2,
      'always',
      [
        // apps/
        'api',
        'web',
        'worker',
        'docs-site',
        // packages/
        'db',
        'geo',
        'sources',
        'scoring',
        'reports',
        'payments',
        'ai',
        'shared',
        // otros directorios de primer nivel
        'etl',
        'infra',
        'docs',
        'catalog', // data-catalog/
        // transversales
        'deps',
        'deps-dev',
        'ci',
        'release',
        'tiles',
        'auth',
        'seguridad',
      ],
    ],
    'scope-empty': [0],
    'scope-case': [2, 'always', 'kebab-case'],

    // ─── Asunto ───────────────────────────────────────────────────────────
    // En español, en minúscula, sin punto final, en imperativo.
    //   feat(api): añade filtro por vocación del suelo
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    // 10 caracteres mínimo: "arregla bug" no dice nada.
    'subject-min-length': [2, 'always', 10],
    'subject-max-length': [2, 'always', 72],

    'header-max-length': [2, 'always', 100],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],

    // ─── Cuerpo y pie ─────────────────────────────────────────────────────
    'body-leading-blank': [2, 'always'],
    'body-max-line-length': [2, 'always', 100],
    'footer-leading-blank': [2, 'always'],
    'footer-max-line-length': [0],
  },

  // Mensajes que se ignoran: los que generan las herramientas.
  ignores: [
    (mensaje) => mensaje.startsWith('Merge '),
    (mensaje) => mensaje.startsWith('Revert '),
    (mensaje) => mensaje.startsWith('Initial commit'),
    // Commits de fusión automática de Dependabot.
    (mensaje) => /^(chore|ci)\(deps(-dev)?\): bump /.test(mensaje),
  ],

  helpUrl:
    'https://www.conventionalcommits.org/es/v1.0.0/ — ámbitos y tipos propios en .github/commitlint.config.js',
};

/*
 * ─── Ejemplos válidos ───────────────────────────────────────────────────────
 *
 *   feat(api): añade filtro por vocación del suelo al DSL de consulta
 *   fix(geo): corrige la descomposición del NPN cuando la condición es 9
 *   data(etl): actualiza el mapeo de R2 al corte 2026-09 del IGAC
 *   legal(reports): añade la advertencia de avalúo catastral al informe de zona
 *   perf(db): particiona core.parcel por departamento
 *   infra: separa la cola de informes de la de ETL
 *   docs(infra): documenta la reversión de migraciones
 *
 * ─── Ejemplos inválidos ─────────────────────────────────────────────────────
 *
 *   arreglos varios                  (sin tipo)
 *   fix: bug                         (asunto demasiado corto y sin contenido)
 *   Feat(API): Nuevo filtro.         (tipo y ámbito en mayúscula, punto final)
 *   feat(frontend): ...              (ámbito no permitido; es `web`)
 *
 * ─── Cambios que rompen compatibilidad ──────────────────────────────────────
 *
 *   feat(api)!: cambia el formato de /parcels/:npn
 *
 *   BREAKING CHANGE: `area_m2` pasa a llamarse `area_geom_m2` y se añade
 *   `area_reported_m2`. Los clientes de la GeoAPI deben actualizarse. Se
 *   mantiene el alias durante una versión menor.
 */
