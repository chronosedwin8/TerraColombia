# TerraColombia

> **Pregúntale al territorio.**
> Señale un punto, un predio, una dirección o dibuje una zona de Colombia, y
> obtenga en segundos —en lenguaje claro y con las fuentes citadas— qué hay ahí,
> qué lo rodea, y qué restricciones y oportunidades tiene.

Motor de inteligencia territorial que integra **catastro, suelos, geografía,
demografía y equipamientos** en un mapa interactivo, con explicaciones en
lenguaje claro, informes exportables y una API comercial.

```
Fuente: IGAC, Base Catastral, corte AAAA-MM, CC BY-SA 4.0
```

---

## Qué resuelve

Hoy, entender un pedazo de Colombia exige abrir seis portales distintos, saber qué
es un NPN, interpretar una clase agrológica y aceptar que el POT de ese municipio
tal vez no esté publicado en ninguna parte. TerraColombia hace ese trabajo una
vez y lo entrega explicado.

| Para quién | Qué necesita | Qué recibe |
|---|---|---|
| **Persona natural** que compra un lote, hereda una finca o evalúa una casa | Entender un predio antes de decidir | Informe territorial de 10 secciones, pago único |
| **Inmobiliarias, constructoras, avaluadores** | Buscar y filtrar predios, analizar zonas | Búsqueda avanzada y análisis de zona, por suscripción |
| **Retail, colegios, clínicas, logística** | Saber dónde abrir o expandirse | Mapa de oportunidad en rejilla H3, con pesos editables |
| **Bancos, aseguradoras, fondos** | Due diligence masivo | Lotes de informes y API |
| **Desarrolladores y proptech** | Datos territoriales normalizados | GeoAPI por consumo |
| **Alcaldías, gestores catastrales, academia** | Análisis territorial | Plan institucional |

### Los doce módulos

| | Módulo | Qué hace |
|---|---|---|
| M1 | **Explorador** | Mapa nacional con capas y buscador universal: dirección, municipio, código predial (30 o 20 dígitos), coordenadas o topónimo |
| M2 | **Ficha de predio** | Todo lo disponible de un predio y su contexto, con divulgación progresiva y procedencia de cada cifra |
| M3 | **Buscador avanzado** | Filtros alfanuméricos y espaciales: área, uso, zona homogénea, distancia a vías o colegios, dentro de un polígono |
| M4 | **Analizador de zona** | Dibuje un polígono, un radio o una isócrona y reciba un tablero: predios, áreas, población, equipamientos, suelos, riesgos |
| M5 | **Aptitud de terreno** | Cruce de predio × suelo × vocación × pendiente × amenazas × áreas protegidas, con semáforo explicado por uso objetivo |
| M6 | **Localización de negocio** | «¿Dónde abro mi X?»: plantillas por tipo de negocio con pesos editables sobre rejilla H3 |
| M7 | **Due diligence territorial** | Informe PDF de 10 secciones con mapas, gráficos, fuentes y QR de verificación |
| M8 | **Cambio territorial** | Comparación entre cortes mensuales: predios nuevos, englobes, desenglobes, construcciones nuevas |
| M9 | **Observatorio** | Indicadores agregados por municipio y sector, con series y rankings |
| M10 | **GeoAPI** | API pública con llaves, cuotas, documentación y SLA |
| M11 | **Asistente** | Búsqueda en lenguaje natural y «Explícame esto» en cada dato |
| M12 | **Cuenta y negocio** | Planes, pagos, créditos, equipos, proyectos guardados, alertas |

---

## Estado del proyecto

**El producto está en construcción.** El estado vivo y detallado está en
[`docs/ESTADO.md`](docs/ESTADO.md); esta tabla es el resumen.

| Fase | Entregable | Estado |
|---|---|---|
| **0 · Descubrimiento** | Crawler de fuentes, catálogo, selección de datasets, diccionario catastral | 🟡 en curso |
| **1 · Cimientos** | Monorepo, base de datos, autenticación, CI | ⚪ pendiente |
| **2 · ETL catastro piloto** | Pipeline completo de un departamento | ⚪ pendiente |
| **3 · Explorador + Ficha** | Mapa con teselas, buscador universal, ficha de predio | ⚪ pendiente |
| **4 · Contexto** | DANE, MEN, REPS, OSM, suelos, amenazas, áreas protegidas, relieve | ⚪ pendiente |
| **5 · Buscador + Zona + Exportación** | M3, M4 y exportación en todos los formatos | ⚪ pendiente |
| **6 · Informes + Pagos** | M7, planes, créditos, pasarela | ⚪ pendiente |
| **7 · Escala nacional** | Todos los departamentos IGAC, adaptadores por gestor catastral | ⚪ pendiente |
| **8 · Inteligencia** | M5, M6, M11 | ⚪ pendiente |
| **9 · Cambio + Observatorio** | M8, M9, alertas | ⚪ pendiente |
| **10 · GeoAPI pública** | Llaves, cuotas, portal de desarrolladores, SDK | ⚪ pendiente |
| **11 · Endurecimiento** | Rendimiento, seguridad, legal, analítica, lanzamiento | ⚪ pendiente |

**MVP vendible = fases 0 a 6** (una región, persona natural y plan Pro).

---

## Estructura del repositorio

```
terracolombia/
├─ apps/
│  ├─ api/              Fastify 5 · REST interno (/api/v1) + GeoAPI pública (/geo/v1)
│  ├─ web/              Vue 3 + Vite + MapLibre GL · la aplicación
│  ├─ worker/           BullMQ · ETL, informes PDF, análisis pesados, alertas
│  └─ docs-site/        VitePress · portal de desarrolladores
├─ packages/
│  ├─ db/               Migraciones SQL (meta/core/ctx/analytics) + Prisma (app)
│  ├─ geo/              CRS, código predial (NPN), H3, validación de geometrías
│  ├─ sources/          Conectores: ArcGIS REST, Socrata, WFS, descarga, OSM
│  ├─ scoring/          Motor de indicadores y plantillas de negocio
│  ├─ reports/          Plantillas HTML de informes y generadores
│  ├─ payments/         Interfaz PaymentProvider y adaptadores
│  ├─ ai/               Asistente: herramientas tipadas, prompts, guardas
│  └─ shared/           Tipos Zod, constantes, i18n es-CO, glosario, planes
├─ data-catalog/        Salida de la Fase 0: inspección real de cada fuente
├─ etl/config/          Datasets declarativos y lista negra de PII
├─ infra/               Docker Compose, CapRover, Martin, Prometheus, Grafana, scripts
└─ docs/                ESTADO · DECISIONES · ARQUITECTURA · OPERACION · SEGURIDAD · LEGAL
```

**Monorepo con pnpm workspaces + Turborepo.** La geometría se consulta siempre con
SQL crudo sobre PostGIS; Prisma solo gestiona el esquema `app` (usuarios, pagos,
informes).

---

## Requisitos

| Herramienta | Versión | Notas |
|---|---|---|
| **Node.js** | 22 LTS o superior | Se prueba en CI contra 22 y 24 |
| **pnpm** | 9.x | `corepack enable && corepack prepare pnpm@9.15.9 --activate` |
| **PostgreSQL** | 16 o superior | 17 funciona y es lo que usa el equipo |
| **PostGIS** | 3.4 o superior | Con `postgis_raster`; se instala con el Stack Builder de PostgreSQL |
| **GDAL** (`ogr2ogr`) | 3.6 o superior | Solo para cargar la GDB/GeoPackage del IGAC. Sin él, la ingesta desde servicios REST y CSV funciona igual |
| Redis 7 | opcional | Sin él, la cola corre en memoria (solo desarrollo) |
| S3 o MinIO | opcional | Sin él, los archivos van a disco local |
| Docker | opcional | Solo si prefiere contenedores a instalación nativa |

Las extensiones de PostgreSQL necesarias (`postgis`, `postgis_raster`, `pg_trgm`,
`unaccent`, `pgcrypto`) y el registro de **EPSG:9377** los instala el script de
preparación. Las extensiones `h3` y `pgrouting` son opcionales: el producto no
depende de ellas ([ADR-002](docs/DECISIONES.md)).

---

## Puesta en marcha en cinco pasos

### Windows (PowerShell)

```powershell
# 1. Verificar el entorno, crear la base de datos, aplicar extensiones y crear .env
pwsh -File infra\scripts\setup-local.ps1

# 2. Editar .env: al menos DATABASE_URL, JWT_SECRET y JWT_REFRESH_SECRET
#    Generar secretos:  node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
notepad .env

# 3. Instalar dependencias
pnpm install

# 4. Aplicar migraciones y cargar la semilla del municipio piloto
pnpm db:migrate
pnpm db:seed

# 5. Levantar api + web + worker
pnpm dev
```

### Linux y macOS

```bash
bash infra/scripts/setup-local.sh
$EDITOR .env
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev
```

Al terminar:

- **Web** → <http://localhost:5173>
- **API** → <http://localhost:3001> · salud en `/health`, dependencias en `/ready`
- **OpenAPI** → <http://localhost:3001/documentation>

### ¿Algo no arranca?

```powershell
pwsh -File infra\scripts\check-health.ps1
```

Comprueba herramientas, configuración, base de datos, extensiones, EPSG:9377,
esquemas, snapshots, Redis, almacenamiento, API y web, y dice **qué está mal y
cómo arreglarlo**. Nunca imprime contraseñas.

La guía completa de problemas frecuentes está en
[`docs/OPERACION.md`](docs/OPERACION.md#problemas).

### Todo en contenedores

```bash
cp .env.example .env    # y editarlo
cd infra
docker compose --env-file ../.env up -d
```

> El PostgreSQL del contenedor escucha en el puerto **55432**, no en el 5432, para
> no chocar con una instalación nativa.

Los datos de demostración que carga `pnpm db:seed` están marcados como sintéticos
y la interfaz los señala con una banda de advertencia: **nada inventado se
presenta como real** ([ADR-006](docs/DECISIONES.md)).

---

## Comandos principales

```bash
# Desarrollo
pnpm dev                          # api + web + worker
pnpm build                        # construir todo
pnpm lint                         # ESLint
pnpm typecheck                    # comprobación de tipos
pnpm test                         # tests unitarios
pnpm format                       # Prettier

# Base de datos
pnpm db:migrate                   # aplicar migraciones pendientes
pnpm db:seed                      # semilla del municipio piloto
pnpm db:reset                     # ¡BORRA TODO! recrea desde cero

# Catálogo de fuentes (Fase 0)
pnpm catalog:crawl                # recorrer ArcGIS REST del IGAC, Socrata, etc.
pnpm catalog:report               # generar data-catalog/CATALOGO.md y SELECCION.md

# ETL
pnpm etl -- status                # estado de todos los datasets
pnpm etl -- run <datasetId>       # corrida completa
pnpm etl -- resume <runId>        # reanudar una corrida interrumpida
pnpm etl -- rollback <datasetId>  # volver al corte anterior

# Infraestructura
pwsh -File infra\scripts\setup-local.ps1     # preparar el entorno
pwsh -File infra\scripts\check-health.ps1    # diagnóstico
pwsh -File infra\scripts\backup.ps1          # respaldo
bash   infra/scripts/restore.sh <respaldo>   # restauración
```

---

## Atribución obligatoria

La base catastral pública del IGAC se publica bajo **Creative Commons
Atribución-CompartirIgual 4.0 Internacional (CC BY-SA 4.0)**. Esa licencia exige
atribución, y la atribución es obligatoria en el mapa, la ficha, el informe y toda
respuesta de la API que use datos catastrales:

> ### Fuente: IGAC, Base Catastral, corte AAAA-MM, CC BY-SA 4.0

`AAAA-MM` es la fecha de corte real del snapshot que se está mostrando, no la
fecha de consulta. El sistema la sustituye automáticamente.

**Toda cifra que muestra TerraColombia lleva su procedencia**: fuente, dataset,
fecha de corte y licencia. Es la regla 4 de [`CLAUDE.md`](CLAUDE.md), y es
estructural: sin procedencia, el dato no se muestra. Cada exportación incluye un
archivo u hoja `FUENTES_Y_LICENCIA`.

Las demás fuentes (DANE, MEN, MinSalud, SGC, IDEAM, Parques Nacionales, UPRA,
OpenStreetMap, Copernicus y los gestores catastrales descentralizados) llevan cada
una su propia atribución y licencia, declaradas por dataset.

---

## Advertencias legales

TerraColombia entrega **indicadores territoriales con su fuente**. No sustituye
ningún acto administrativo ni ningún concepto profesional.

> ### ⚠️ Lo que TerraColombia **no** es
>
> - **No es un certificado catastral.** Los certificados y las
>   constancias catastrales solo los expide el gestor catastral competente.
> - **No es un avalúo.** El **avalúo catastral no es el valor comercial** del
>   predio: son dos cosas distintas por definición legal y el primero suele estar
>   muy por debajo del segundo. Un avalúo comercial solo lo emite un avaluador
>   registrado en el RAA.
> - **No es un concepto de norma urbanística.** La información de ordenamiento
>   territorial es referencial. La norma aplicable a un predio la certifica la
>   oficina de Planeación del municipio.
> - **No reemplaza un estudio de títulos.** La situación jurídica de un inmueble
>   se establece en la Oficina de Registro de Instrumentos Públicos.
>
> ### Cobertura
>
> La base catastral abierta cubre los municipios donde **el IGAC es gestor
> catastral**. Bogotá, Medellín, Cali, Barranquilla, el departamento de Antioquia
> y un número creciente de gestores habilitados tienen su propio catastro. Cuando
> un municipio no está cubierto, la aplicación **lo dice explícitamente** y
> muestra qué información sí tiene.
>
> No existe repositorio nacional completo de planes de ordenamiento territorial.
> Donde no hay POT integrado, la respuesta es «no disponible: consulte Planeación
> municipal».
>
> ### Datos personales
>
> **No existe ni existirá la ruta predio → persona.** Ningún dato que identifique
> a una persona (nombre de propietario, documento, teléfono, dirección personal) se
> ingiere, se almacena ni se muestra. Se descarta en la ingesta y se registra el
> descarte. Si encuentra cualquier dato personal en el sistema, escriba de
> inmediato a **privacidad@terracolombia.co**.

El texto legal completo está en [`docs/LEGAL.md`](docs/LEGAL.md).

---

## Documentación

| Documento | Para qué |
|---|---|
| [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) | Cómo está construido el sistema y por qué: componentes, modelo de datos por esquema, ETL, teselas, H3, publicación atómica, adaptadores |
| [`docs/OPERACION.md`](docs/OPERACION.md) | Puesta en marcha, corridas de ETL, cron mensual, respaldos, entornos, migraciones y **resolución de problemas frecuentes** |
| [`docs/SEGURIDAD.md`](docs/SEGURIDAD.md) | OWASP ASVS nivel 2 aplicado a este sistema, anti-scraping, manejo de secretos, respuesta ante incidentes |
| [`docs/DECISIONES.md`](docs/DECISIONES.md) | Registro de decisiones técnicas (ADR) |
| [`docs/ESTADO.md`](docs/ESTADO.md) | Estado vivo por fases |
| [`docs/LEGAL.md`](docs/LEGAL.md) | Licencias, atribuciones y advertencias completas |
| [`CLAUDE.md`](CLAUDE.md) | Las diez reglas de trabajo en este repositorio |
| [`PLAN_CLAUDE_CODE_TerraColombia.md`](PLAN_CLAUDE_CODE_TerraColombia.md) | Plan maestro del producto |

---

## Contribuir

Antes de abrir un pull request, lea [`CLAUDE.md`](CLAUDE.md): son diez reglas
cortas y todas son obligatorias. Las tres que más se olvidan:

1. **No inventar campos, capas ni URL de fuentes.** Todo sale de la inspección
   real registrada en `data-catalog/`. Lo que no existe se marca
   `NO_DISPONIBLE`; no se simula.
2. **Toda cifra lleva procedencia.** Sin fuente, dataset, fecha de corte y
   licencia, no se muestra.
3. **Cero datos personales.** Sin excepciones, en ningún plan, por ningún precio.

Commits convencionales (configuración y tipos propios en
[`.github/commitlint.config.js`](.github/commitlint.config.js)). Las plantillas de
pull request e incidencia piden la información necesaria para revisar; la de
**problema de datos** es la más usada, porque la mayoría de los «errores» son
datos de origen y no fallos del programa.

---

## Licencia

### Datos

Los datos provienen de fuentes públicas colombianas y **conservan la licencia de
su fuente**. La base catastral del IGAC es CC BY-SA 4.0, con la atribución
obligatoria indicada arriba. Cada dataset declara la suya en `meta.dataset` y la
arrastra hasta la ficha, el informe y la exportación.

Los datos del IGAC (capa abierta) y los indicadores propios se mantienen
**separados** en la base de datos y en las exportaciones, porque la cláusula
*CompartirIgual* puede alcanzar a bases derivadas que se redistribuyan. El detalle
está en [`docs/LEGAL.md`](docs/LEGAL.md) y en
[`docs/ARQUITECTURA.md` §3](docs/ARQUITECTURA.md#modelo-de-datos-por-esquema).

### Código

**Pendiente de definición antes del lanzamiento comercial.** La licencia del
código se fijará junto con la revisión legal sobre CC BY-SA y bases derivadas que
el plan marca como requisito previo (PLAN §2). Hasta entonces, el contenido de
este repositorio es propiedad de sus autores y no se otorga licencia de uso.

Cuando se defina, el archivo `LICENSE` de la raíz será la referencia y esta
sección apuntará a él.
