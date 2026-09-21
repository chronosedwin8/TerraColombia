---
layout: home
title: GeoAPI TerraColombia
titleTemplate: Documentación
hero:
  name: GeoAPI TerraColombia
  text: Pregúntale al territorio, por HTTP
  tagline: Predios, suelos, amenazas, población, equipamientos e indicadores de Colombia, normalizados, con fuente y licencia en cada respuesta.
  actions:
    - theme: brand
      text: Inicio rápido (5 minutos)
      link: /guia/inicio-rapido
    - theme: alt
      text: Referencia de la API
      link: /referencia/
    - theme: alt
      text: Probar ahora
      link: /playground
features:
  - title: Una llave, una llamada
    details: Llave de API por cabecera, respuesta en JSON o GeoJSON, y un bloque `meta` que dice de dónde salió cada cifra. Sin SDK obligatorio ni pasos previos.
  - title: Procedencia siempre
    details: Cada respuesta declara fuente, dataset, fecha de corte y licencia. Si un dato no existe, la API dice `NO_DISPONIBLE` en lugar de estimarlo.
  - title: Cobertura honesta
    details: La cobertura catastral depende del gestor de cada municipio. La API lo dice en `meta.coverage`, y nunca devuelve un vacío sin explicación.
  - title: Consultas espaciales de verdad
    details: Filtros alfanuméricos y espaciales en un DSL validado, análisis por polígono, radio o isócrona, y agregados por celda H3.
  - title: Indicadores explicables
    details: Todo puntaje llega con su desglose por factor, su fórmula y su peso. Nunca un número sin explicación.
  - title: Exportación lista para usar
    details: PDF, XLSX, CSV, GeoJSON, GeoPackage, Shapefile y KML. Toda exportación incluye `FUENTES_Y_LICENCIA`.
---

## Qué es esto

`TerraColombia` reúne datos abiertos del territorio colombiano —catastro del IGAC, suelos y
agrología, cartografía básica, población del DANE, colegios del MEN, prestadores de salud del
REPS, vías y puntos de interés de OpenStreetMap, amenazas del SGC y del IDEAM, áreas protegidas
del RUNAP— los normaliza en un modelo único y los sirve por HTTP.

**Lo que aporta no es el dato, es el servicio:** normalización, cruce espacial, agregados
comparables, explicabilidad y disponibilidad. Los datos de origen son abiertos y puedes
descargarlos tú mismo de cada entidad.

## Lo que la API no hace

Conviene saberlo antes de integrar:

- **No relaciona predios con personas.** No hay propietarios, ni documentos, ni teléfonos, ni
  direcciones personales. Esa ruta no existe y no va a existir.
- **No entrega avalúos comerciales.** El avalúo catastral que reporta es un valor fiscal
  determinado por la autoridad catastral y habitualmente difiere del precio de mercado.
- **No emite conceptos de norma urbanística.** Lo que se puede construir lo define el POT del
  municipio.
- **No sustituye un estudio de títulos** ni un certificado catastral.
- **No cubre todos los municipios con datos catastrales.** Los municipios con catastro
  descentralizado o gestor habilitado (Bogotá, Medellín, Cali, Barranquilla, Antioquia y otros)
  no están en la base abierta del IGAC. La API lo declara en cada respuesta.

## Empieza por aquí

| Si quieres… | Ve a |
| --- | --- |
| Hacer tu primera llamada ya | [Inicio rápido](/guia/inicio-rapido) |
| Entender las llaves y los entornos | [Autenticación](/guia/autenticacion) |
| Saber qué te deja hacer tu plan | [Cuotas y planes](/guia/cuotas-y-planes) |
| Recorrer muchos resultados | [Paginación, caché y bbox](/guia/paginacion-y-cache) |
| Saber si puedes redistribuir los datos | [Licencias y atribución](/guia/licencias-y-atribucion) |
| Ver todos los endpoints | [Referencia](/referencia/) |
| Probar sin escribir código | [Playground](/playground) |

::: info Atribución obligatoria
Si publicas cualquier cosa construida con datos catastrales de esta API, debes incluir:

> Fuente: IGAC, Base Catastral, corte AAAA-MM, CC BY-SA 4.0

La cláusula *CompartirIgual* de esa licencia puede alcanzar a las bases derivadas que
redistribuyas. Lee [Licencias y atribución](/guia/licencias-y-atribucion) antes de construir un
producto encima.
:::
