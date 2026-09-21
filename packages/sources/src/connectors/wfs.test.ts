import { describe, expect, it } from 'vitest';
import { normalizeWfsUrl, parseCapabilities, parseFeatureTypeFields } from './wfs.js';

/**
 * `GetCapabilities` recortado de un WFS 2.0.0 tal como lo publica GeoServer y
 * como lo expone la extensión `WFSServer` de ArcGIS Server (el IGAC declara
 * `supportedExtensions: "WFSServer, WMSServer"` en sus MapServer).
 */
const WFS_200 = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:WFS_Capabilities version="2.0.0" xmlns:wfs="http://www.opengis.net/wfs/2.0"
  xmlns:ows="http://www.opengis.net/ows/1.1">
  <ows:ServiceIdentification>
    <ows:Title>Dato Fundamental Catastro</ows:Title>
    <ows:Abstract>Capas R/U de terreno y construcci&#243;n</ows:Abstract>
    <ows:Fees>NONE</ows:Fees>
    <ows:AccessConstraints>CC BY-SA 4.0</ows:AccessConstraints>
  </ows:ServiceIdentification>
  <ows:ServiceProvider>
    <ows:ProviderName>IGAC</ows:ProviderName>
  </ows:ServiceProvider>
  <ows:OperationsMetadata>
    <ows:Operation name="GetCapabilities"/>
    <ows:Operation name="DescribeFeatureType"/>
    <ows:Operation name="GetFeature">
      <ows:Parameter name="outputFormat">
        <ows:AllowedValues>
          <ows:Value>application/gml+xml; version=3.2</ows:Value>
          <ows:Value>application/json</ows:Value>
          <ows:Value>GEOJSON</ows:Value>
        </ows:AllowedValues>
      </ows:Parameter>
    </ows:Operation>
    <ows:Constraint name="CountDefault">
      <ows:DefaultValue>1000</ows:DefaultValue>
    </ows:Constraint>
  </ows:OperationsMetadata>
  <FeatureTypeList>
    <FeatureType>
      <Name>igac:U_TERRENO</Name>
      <Title>Terreno urbano</Title>
      <Abstract>Pol&#237;gonos de terreno en zona urbana</Abstract>
      <DefaultCRS>urn:ogc:def:crs:EPSG::4686</DefaultCRS>
      <OtherCRS>urn:ogc:def:crs:EPSG::4326</OtherCRS>
      <ows:Keywords><ows:Keyword>catastro</ows:Keyword><ows:Keyword>terreno</ows:Keyword></ows:Keywords>
      <ows:WGS84BoundingBox>
        <ows:LowerCorner>-81.72 -0.056</ows:LowerCorner>
        <ows:UpperCorner>-67.91 12.59</ows:UpperCorner>
      </ows:WGS84BoundingBox>
    </FeatureType>
    <FeatureType>
      <Name>igac:R_TERRENO</Name>
      <Title>Terreno rural</Title>
      <DefaultCRS>urn:ogc:def:crs:EPSG::4686</DefaultCRS>
    </FeatureType>
  </FeatureTypeList>
</wfs:WFS_Capabilities>`;

/** WFS 1.1.0: usa `DefaultSRS`, `LatLongBoundingBox` y no tiene `startIndex`. */
const WFS_110 = `<?xml version="1.0" encoding="UTF-8"?>
<WFS_Capabilities version="1.1.0" xmlns="http://www.opengis.net/wfs">
  <Service>
    <Title>Servicio antiguo</Title>
    <Abstract>WFS 1.1.0</Abstract>
    <Fees>NONE</Fees>
    <AccessConstraints>NONE</AccessConstraints>
  </Service>
  <Capability>
    <Request>
      <GetFeature>
        <ResultFormat><GML2/><SHAPE-ZIP/></ResultFormat>
      </GetFeature>
    </Request>
  </Capability>
  <FeatureTypeList>
    <FeatureType>
      <Name>topp:municipios</Name>
      <Title>Municipios</Title>
      <DefaultSRS>EPSG:4326</DefaultSRS>
      <LatLongBoundingBox minx="-79.1" miny="-4.3" maxx="-66.8" maxy="12.6"/>
    </FeatureType>
  </FeatureTypeList>
</WFS_Capabilities>`;

describe('parseCapabilities — WFS 2.0.0', () => {
  const caps = parseCapabilities(WFS_200);

  it('detecta la versión', () => {
    expect(caps.version).toBe('2.0.0');
  });

  it('lee la identificación del servicio', () => {
    expect(caps.title).toBe('Dato Fundamental Catastro');
    expect(caps.abstract).toContain('construcción');
    expect(caps.provider).toBe('IGAC');
    expect(caps.accessConstraints).toBe('CC BY-SA 4.0');
    expect(caps.fees).toBe('NONE');
  });

  it('detecta soporte de GeoJSON en outputFormat', () => {
    expect(caps.supportsGeoJson).toBe(true);
    expect(caps.outputFormats).toContain('application/json');
    expect(caps.outputFormats).toContain('GEOJSON');
  });

  it('lee CountDefault', () => {
    expect(caps.countDefault).toBe(1000);
  });

  it('lista las operaciones anunciadas', () => {
    expect(caps.operations).toContain('GetFeature');
    expect(caps.operations).toContain('DescribeFeatureType');
  });

  it('lista los feature types con CRS, bbox y palabras clave', () => {
    expect(caps.featureTypes.map((f) => f.name)).toEqual(['igac:U_TERRENO', 'igac:R_TERRENO']);
    const terreno = caps.featureTypes[0]!;
    expect(terreno.title).toBe('Terreno urbano');
    expect(terreno.defaultCrs).toBe('urn:ogc:def:crs:EPSG::4686');
    expect(terreno.otherCrs).toEqual(['urn:ogc:def:crs:EPSG::4326']);
    expect(terreno.keywords).toEqual(['catastro', 'terreno']);
    expect(terreno.wgs84BBox).toEqual([-81.72, -0.056, -67.91, 12.59]);
  });

  it('deja bbox en null cuando no se declara', () => {
    expect(caps.featureTypes[1]?.wgs84BBox).toBeNull();
  });
});

describe('parseCapabilities — WFS 1.1.0', () => {
  const caps = parseCapabilities(WFS_110);

  it('detecta la versión antigua', () => {
    expect(caps.version).toBe('1.1.0');
  });

  it('lee DefaultSRS y LatLongBoundingBox', () => {
    const ft = caps.featureTypes[0]!;
    expect(ft.defaultCrs).toBe('EPSG:4326');
    expect(ft.wgs84BBox).toEqual([-79.1, -4.3, -66.8, 12.6]);
  });

  it('no declara GeoJSON', () => {
    expect(caps.supportsGeoJson).toBe(false);
    expect(caps.outputFormats).toContain('GML2');
  });
});

describe('parseCapabilities — entradas degeneradas', () => {
  it('no lanza con XML vacío', () => {
    const caps = parseCapabilities('');
    expect(caps.featureTypes).toEqual([]);
    expect(caps.version).toBe('2.0.0');
  });

  it('no lanza con XML que no es de WFS', () => {
    const caps = parseCapabilities('<html><body>503 Service Unavailable</body></html>');
    expect(caps.featureTypes).toEqual([]);
  });
});

describe('normalizeWfsUrl', () => {
  it('quita los parámetros WFS ya presentes', () => {
    expect(
      normalizeWfsUrl(
        'https://x/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=a:b&count=10',
      ),
    ).toBe('https://x/geoserver/wfs');
  });

  it('conserva los parámetros ajenos a WFS', () => {
    expect(normalizeWfsUrl('https://x/wfs?token=abc&request=GetCapabilities')).toBe(
      'https://x/wfs?token=abc',
    );
  });
});

describe('parseFeatureTypeFields', () => {
  it('lee los campos del XSD de DescribeFeatureType', () => {
    const xsd = `<?xml version="1.0"?>
      <xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema">
        <xsd:element name="CODIGO" nillable="true" type="xsd:string"/>
        <xsd:element name="SHAPE_Area" nillable="true" type="xsd:double"/>
        <xsd:element name="Shape" nillable="false" type="gml:SurfacePropertyType"/>
      </xsd:schema>`;
    const fields = parseFeatureTypeFields(xsd);
    expect(fields).toEqual([
      { name: 'CODIGO', type: 'xsd:string', nillable: true },
      { name: 'SHAPE_Area', type: 'xsd:double', nillable: true },
      { name: 'Shape', type: 'gml:SurfacePropertyType', nillable: false },
    ]);
  });
});
