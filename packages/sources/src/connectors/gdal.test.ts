import { describe, expect, it } from 'vitest';
import { detectGdal, parseGdalVersion, runOgr2Ogr } from './gdal.js';

describe('parseGdalVersion', () => {
  it('extrae la versión de la salida real de ogr2ogr --version', () => {
    expect(parseGdalVersion('GDAL 3.9.2, released 2024/08/13')).toEqual([3, 9, 2]);
  });

  it('tolera mayúsculas y espacios', () => {
    expect(parseGdalVersion('  gdal  3.11.0, released 2025/05/07 ')).toEqual([3, 11, 0]);
  });

  it('devuelve null si no hay versión', () => {
    expect(parseGdalVersion('')).toBeNull();
    expect(parseGdalVersion('command not found')).toBeNull();
    expect(parseGdalVersion('GDAL')).toBeNull();
  });
});

describe('detectGdal', () => {
  it('devuelve la forma completa del contrato', async () => {
    const info = await detectGdal(true);
    expect(info).toMatchObject({
      available: expect.any(Boolean) as boolean,
      notes: expect.any(Array) as string[],
    });
    // `path`, `version`, `gdalDataDir`, `projLibDir` son string o null.
    for (const key of ['path', 'version', 'gdalDataDir', 'projLibDir'] as const) {
      const v = info[key];
      expect(v === null || typeof v === 'string').toBe(true);
    }
    expect(['env', 'path', 'known-location', null]).toContain(info.discoveredVia);
  });

  it('es coherente: si está disponible hay ruta y versión', async () => {
    const info = await detectGdal(true);
    if (info.available) {
      expect(info.path).toBeTruthy();
      expect(info.version).toContain('GDAL');
      expect(info.semver?.[0]).toBeGreaterThanOrEqual(3);
    } else {
      expect(info.notes.join(' ')).toMatch(/ogr2ogr|GDAL/);
    }
  });

  it('memoriza el resultado y lo recalcula con force', async () => {
    const a = await detectGdal(true);
    const b = await detectGdal();
    expect(b).toBe(a);
    const c = await detectGdal(true);
    expect(c).not.toBe(a);
    expect(c.available).toBe(a.available);
  });

  it('ignora GDAL_OGR2OGR cuando apunta a algo que no existe y lo anota', async () => {
    const previous = process.env.GDAL_OGR2OGR;
    process.env.GDAL_OGR2OGR = 'C:/no/existe/ogr2ogr.exe';
    try {
      const info = await detectGdal(true);
      expect(info.notes.join(' ')).toContain('GDAL_OGR2OGR');
      expect(info.path).not.toBe('C:/no/existe/ogr2ogr.exe');
    } finally {
      if (previous === undefined) delete process.env.GDAL_OGR2OGR;
      else process.env.GDAL_OGR2OGR = previous;
      await detectGdal(true);
    }
  });

  it('cuando encuentra gdal-data, es un directorio existente', async () => {
    const info = await detectGdal(true);
    if (info.gdalDataDir !== null) {
      const { stat } = await import('node:fs/promises');
      expect((await stat(info.gdalDataDir)).isDirectory()).toBe(true);
    }
  });

  it('cuando encuentra projLibDir, contiene proj.db', async () => {
    const info = await detectGdal(true);
    if (info.projLibDir !== null) {
      const { stat } = await import('node:fs/promises');
      const { join } = await import('node:path');
      expect((await stat(join(info.projLibDir, 'proj.db'))).isFile()).toBe(true);
    }
  });
});

describe('runOgr2Ogr', () => {
  it('ejecuta --version o falla con un mensaje claro si no hay GDAL', async () => {
    const info = await detectGdal();
    if (!info.available) {
      await expect(runOgr2Ogr(['--version'])).rejects.toThrow(/ogr2ogr/);
      return;
    }
    const result = await runOgr2Ogr(['--version'], { throwOnError: false });
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain('GDAL');
    expect(result.exitCode).toBe(0);
    expect(result.command).toContain('ogr2ogr');
  });

  it('enmascara la contraseña de una cadena de conexión PG en el comando registrado', async () => {
    const info = await detectGdal();
    if (!info.available) return;
    // `--help-general` no toca la red ni la base; solo interesa el comando registrado.
    const result = await runOgr2Ogr(
      ['--help-general', 'PG:host=localhost password=secreto123 dbname=x'],
      { throwOnError: false },
    );
    expect(result.command).not.toContain('secreto123');
    expect(result.command).toContain('password=***');
  });
});
