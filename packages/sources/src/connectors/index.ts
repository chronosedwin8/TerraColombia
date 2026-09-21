/** Conectores de fuentes externas. Ninguno depende de paquetes de terceros. */

export * from './http.js';
export * from './file-download.js';
export * from './gdal.js';
export * from './osm.js';
export * from './socrata.js';

// `arcgis-rest` y `wfs` exportan ambos `parseCapabilities` e `iterateFeatures`;
// se reexportan con espacio de nombres para que no colisionen.
export * as arcgis from './arcgis-rest.js';
export * as wfs from './wfs.js';

export type {
  ArcgisField,
  ArcgisLayerInfo,
  ArcgisLayerRef,
  ArcgisServiceInfo,
  ArcgisServiceRef,
  ArcgisExtent,
  ArcgisSpatialReference,
  ArcgisDomain,
  FeatureBatch,
  PaginationStrategy,
} from './arcgis-rest.js';

export type { WfsCapabilities, WfsFeatureTypeInfo, WfsVersion } from './wfs.js';
