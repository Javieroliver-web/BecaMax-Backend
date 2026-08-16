const supabase = require('../config/supabase');
const BECAS_ESTATICAS = require('../data/becas');

// ============================================================
//  GET /api/becas
//  Query params:
//    - tipo, region, area, plazo  → strings (filtros exactos)
//    - busqueda                   → string (búsqueda libre)
//    - importeMin, importeMax     → números
//    - orden                      → 'deadline' | 'importe_desc' | 'importe_asc' | 'nombre'
//    - page, limit                → paginación (default: 1, 50)
// ============================================================

function diasRestantes(deadline) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fin = new Date(deadline);
    return Math.ceil((fin - hoy) / 86400000);
}

function urgencia(dias) {
    if (dias < 0) return 'cerrada';
    if (dias <= 7) return 'urgente';
    if (dias <= 30) return 'proximo';
    return 'disponible';
}

function aplicarFiltros(becas, { busqueda, tipo, region, area, importeMin, importeMax, plazo }) {
    return becas.filter(b => {
        const dias = diasRestantes(b.deadline);
        const u = urgencia(dias);

        if (tipo && b.tipo !== tipo) return false;
        if (region && b.region !== region && b.region !== 'Nacional') return false;
        if (area && b.area !== area && b.area !== 'Cualquier área') return false;
        if (importeMin !== null && b.importe && b.importe.max < importeMin) return false;
        if (importeMax !== null && b.importe && b.importe.min > importeMax) return false;

        if (plazo === 'urgente' && u !== 'urgente') return false;
        if (plazo === 'proximo' && u !== 'proximo') return false;
        if (plazo === 'disponible' && u !== 'disponible') return false;
        if (plazo === 'abiertas' && u === 'cerrada') return false;

        if (busqueda) {
            const q = busqueda.toLowerCase();
            return (
                b.nombre.toLowerCase().includes(q) ||
                b.entidad.toLowerCase().includes(q) ||
                (b.etiquetas && b.etiquetas.some(e => e.toLowerCase().includes(q)))
            );
        }
        return true;
    });
}

function aplicarOrden(becas, orden) {
    return [...becas].sort((a, b) => {
        switch (orden) {
            case 'importe_desc': return (b.importe?.max ?? 0) - (a.importe?.max ?? 0);
            case 'importe_asc':  return (a.importe?.min ?? 0) - (b.importe?.min ?? 0);
            case 'nombre':       return a.nombre.localeCompare(b.nombre, 'es');
            case 'deadline':
            default:             return new Date(a.deadline) - new Date(b.deadline);
        }
    });
}

const getBecas = async (req, res) => {
    try {
        // 1. Parsear parámetros de query
        const {
            busqueda = '',
            tipo = '',
            region = '',
            area = '',
            plazo = '',
            orden = 'deadline',
            page = 1,
            limit = 50
        } = req.query;

        const importeMin = req.query.importeMin ? Number(req.query.importeMin) : null;
        const importeMax = req.query.importeMax ? Number(req.query.importeMax) : null;
        const pageNum    = Math.max(1, parseInt(page));
        const limitNum   = Math.min(100, Math.max(1, parseInt(limit)));

        // 2. Intentar cargar desde Supabase; fallback a datos estáticos
        let todasLasBecas = [];
        const { data: dbBecas, error: dbError } = await supabase
            .from('becas')
            .select('*');

        if (dbError || !dbBecas || dbBecas.length === 0) {
            console.warn('Supabase sin datos de becas, usando fallback estático:', dbError?.message);
            todasLasBecas = BECAS_ESTATICAS;
        } else {
            todasLasBecas = dbBecas;
        }

        // 3. Aplicar filtros
        const filtros = { busqueda, tipo, region, area, importeMin, importeMax, plazo };
        const filtradas = aplicarFiltros(todasLasBecas, filtros);

        // 4. Aplicar ordenación
        const ordenadas = aplicarOrden(filtradas, orden);

        // 5. Paginación
        const total  = ordenadas.length;
        const offset = (pageNum - 1) * limitNum;
        const pagina = ordenadas.slice(offset, offset + limitNum);

        // 6. Respuesta
        res.json({
            status: 'success',
            data: pagina,
            meta: {
                total,
                page:  pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum),
                fuente: dbError ? 'estatico' : 'supabase'
            }
        });

    } catch (error) {
        console.error('Error en getBecas:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error interno del servidor',
            details: error.message
        });
    }
};

// GET /api/becas/:id — Obtener una beca por ID
const getBecaById = async (req, res) => {
    try {
        const { id } = req.params;

        // Intentar Supabase primero
        const { data: dbBecas } = await supabase.from('becas').select('*');
        const fuente = (dbBecas && dbBecas.length > 0) ? dbBecas : BECAS_ESTATICAS;
        
        // Buscar por id numérico o UUID
        const beca = fuente.find(b => String(b.id) === String(id));

        if (!beca) {
            return res.status(404).json({ status: 'error', message: 'Beca no encontrada' });
        }

        res.json({ status: 'success', data: beca });

    } catch (error) {
        console.error('Error en getBecaById:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

module.exports = { getBecas, getBecaById };
