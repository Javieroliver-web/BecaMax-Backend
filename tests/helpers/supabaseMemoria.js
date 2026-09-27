'use strict';
// Supabase en memoria para tests: entiende las consultas encadenadas que usa
// el backend (select/insert/update/delete + filtros). No es PostgREST: solo
// lo justo para probar la lógica sin red. Las columnas UNIQUE se declaran
// por tabla para simular el error 23505.
function supabaseMemoria(datos = {}, { unicos = {} } = {}) {
  const tablas = {};
  for (const [t, filas] of Object.entries(datos)) tablas[t] = filas.map((f) => ({ ...f }));
  let secuencia = 1000;

  class Consulta {
    constructor(tabla) {
      this.tabla = tabla; this.filtros = []; this.op = 'select'; this.lim = Infinity;
      tablas[tabla] = tablas[tabla] || [];
    }
    select() { this.devolver = true; return this; }
    eq(c, v) { this.filtros.push((f) => f[c] === v); return this; }
    is(c, v) { this.filtros.push((f) => (f[c] ?? null) === v); return this; }
    not(c, op, v) { this.filtros.push((f) => (op === 'is' ? (f[c] ?? null) !== v : f[c] !== v)); return this; }
    gte(c, v) { this.filtros.push((f) => f[c] != null && f[c] >= v); return this; }
    lte(c, v) { this.filtros.push((f) => f[c] != null && f[c] <= v); return this; }
    lt(c, v) { this.filtros.push((f) => f[c] != null && f[c] < v); return this; }
    in(c, vs) { this.filtros.push((f) => vs.includes(f[c])); return this; }
    order(c, { ascending = true } = {}) { this.orden = [c, ascending]; return this; }
    limit(n) { this.lim = n; return this; }
    insert(fila) { this.op = 'insert'; this.fila = fila; return this; }
    update(campos) { this.op = 'update'; this.campos = campos; return this; }
    delete() { this.op = 'delete'; return this; }
    then(ok, ko) { return Promise.resolve().then(() => this.ejecutar()).then(ok, ko); }
    ejecutar() {
      const t = tablas[this.tabla];
      const duplicada = (fila, excepto) => (unicos[this.tabla] || []).some((c) =>
        fila[c] != null && t.some((f) => f !== excepto && f[c] === fila[c]));
      if (this.op === 'insert') {
        const fila = { id: ++secuencia, ...this.fila };
        if (duplicada(fila)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        t.push(fila);
        return { data: null, error: null };
      }
      let filas = t.filter((f) => this.filtros.every((fn) => fn(f)));
      if (this.op === 'update') {
        for (const f of filas) {
          if (duplicada({ ...f, ...this.campos }, f)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        for (const f of filas) Object.assign(f, this.campos);
        return { data: filas.map((f) => ({ ...f })), error: null };
      }
      if (this.op === 'delete') {
        tablas[this.tabla] = t.filter((f) => !filas.includes(f));
        return { data: filas.map((f) => ({ ...f })), error: null };
      }
      if (this.orden) {
        const [c, asc] = this.orden;
        filas = [...filas].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1));
      }
      return { data: filas.slice(0, this.lim).map((f) => ({ ...f })), error: null };
    }
  }
  return { tablas, from: (tabla) => new Consulta(tabla) };
}

module.exports = { supabaseMemoria };
