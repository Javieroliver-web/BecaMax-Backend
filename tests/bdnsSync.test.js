'use strict';
// Tests de la sincronización con la BDNS (node --test, sin red).
//
// Los textos de plazo y las regiones son ejemplos reales copiados de la API
// de la BDNS (muestra de 148 convocatorias con "beca", septiembre de 2026).
const test = require('node:test');
const assert = require('node:assert');
const { regionDe, extraerFechaFin, mapearABeca } = require('../src/services/bdnsSync.service');

const detalleBase = (extra = {}) => ({
  codigoBDNS: '931783',
  descripcion: 'CONVOCATORIA BECAS MADRES ESTUDIANTES 2026',
  organo: { nivel1: 'LOCAL', nivel2: 'GRANADA', nivel3: 'AYUNTAMIENTO DE GRANADA' },
  regiones: [{ descripcion: 'ES614 - Granada' }],
  urlBasesReguladoras: 'https://example.org/bases.pdf',
  fechaFinSolicitud: null,
  textFin: null,
  sectores: [],
  ...extra,
});

test('extraerFechaFin: fechas explícitas en los formatos que usa la BDNS', () => {
  assert.strictEqual(extraerFechaFin('30/10/2026'), '2026-10-30');
  assert.strictEqual(extraerFechaFin('7 de octubre de 2026'), '2026-10-07');
  assert.strictEqual(extraerFechaFin('16 OCTUBRE 2026'), '2026-10-16');
  assert.strictEqual(extraerFechaFin('Hasta las 14:00 el día 9 de octubre de 2026'), '2026-10-09');
  assert.strictEqual(extraerFechaFin('Hasta el 13 de octubre de 2026'), '2026-10-13');
});

test('extraerFechaFin: plazos relativos o ambiguos no se convierten en fecha', () => {
  assert.strictEqual(extraerFechaFin('15 días hábiles desde el inicio del plazo de solicitudes'), null);
  assert.strictEqual(extraerFechaFin('Un mes'), null);
  assert.strictEqual(extraerFechaFin('Periodo de de entrega de solicitudes cerrado el dia .'), null);
  assert.strictEqual(extraerFechaFin('Sin plazo de solicitud'), null);
  assert.strictEqual(extraerFechaFin('Del 1/10/2026 al 30/10/2026'), null, 'dos fechas distintas');
  assert.strictEqual(extraerFechaFin('31/02/2026'), null, 'fecha imposible');
  assert.strictEqual(extraerFechaFin(null), null);
});

test('regionDe: Estado es Nacional; ES61x es Andalucía; el resto se descarta', () => {
  assert.strictEqual(regionDe({ organo: { nivel1: 'ESTADO' }, regiones: [{ descripcion: 'ES - ESPAÑA ' }] }), 'Nacional');
  assert.strictEqual(regionDe({ organo: { nivel1: 'LOCAL', nivel2: 'GRANADA' }, regiones: [{ descripcion: 'ES614 - Granada' }] }), 'Andalucía');
  assert.strictEqual(regionDe({ organo: { nivel1: 'OTROS', nivel2: 'UNIVERSIDAD DE GRANADA' }, regiones: [{ descripcion: 'ES614 - Granada' }] }), 'Andalucía');
  assert.strictEqual(regionDe({ organo: { nivel1: 'AUTONOMICA', nivel2: 'ANDALUCÍA' }, regiones: [] }), 'Andalucía');
  assert.strictEqual(regionDe({ organo: { nivel1: 'OTROS', nivel2: 'UNIVERSIDAD DE VIGO' }, regiones: [{ descripcion: 'ES11 - GALICIA' }] }), null);
  assert.strictEqual(regionDe({ organo: { nivel1: 'LOCAL', nivel2: 'MURCIA' }, regiones: [{ descripcion: 'ES62 - REGION DE MURCIA' }] }), null, 'ES62 no es ES61');
  assert.strictEqual(regionDe(null), null);
});

test('mapearABeca: usa textFin cuando falta fechaFinSolicitud', () => {
  const beca = mapearABeca(detalleBase({ textFin: '31 de diciembre de 2099' }), 'Andalucía');
  assert.strictEqual(beca.deadline, '2099-12-31');
  assert.strictEqual(beca.region, 'Andalucía');
  assert.strictEqual(beca.importe, null);
});

test('mapearABeca: sin plazo claro, cerrada o sin bases oficiales no se guarda', () => {
  assert.strictEqual(mapearABeca(detalleBase({ textFin: '15 días hábiles' }), 'Andalucía'), null);
  assert.strictEqual(mapearABeca(detalleBase({ fechaFinSolicitud: '2020-01-01' }), 'Andalucía'), null);
  assert.strictEqual(mapearABeca(detalleBase({ textFin: '31/12/2099', urlBasesReguladoras: null }), 'Andalucía'), null);
});
