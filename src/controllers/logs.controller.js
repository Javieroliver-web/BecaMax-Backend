const { createClient } = require('@supabase/supabase-js');

const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Falta configuración de Supabase URL o Service Key en el entorno del servidor.');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
};

// Registra visitas a la home en system_logs (Supabase), visible en el panel
// admin. Sustituye al envío anterior a un webhook de Discord: Discord no es
// un encargado del tratamiento con el que tengamos un contrato de encargo
// (DPA) real, así que los datos de acceso se quedan dentro de Supabase,
// proveedor ya cubierto en la política de privacidad.
const registrarVisita = async (req, res) => {
  try {
    let { page, ts, country, city, ip, device, lang, screen, referrer } = req.body;

    if (!page || typeof page !== 'string' || page.length > 200) {
      return res.status(400).json({ status: 'error', message: 'Datos de log inválidos o sospechosos.' });
    }

    // Capar longitud de campos opcionales: no se validan más allá de esto
    // (la inserción es parametrizada, sin riesgo de inyección), pero sin
    // límite un cliente malicioso podría enviar payloads arbitrariamente
    // grandes y abusar del almacenamiento de system_logs.
    const cap = (v, max) => (typeof v === 'string' ? v.slice(0, max) : v);
    ts = cap(ts, 40);
    country = cap(country, 60);
    city = cap(city, 60);
    ip = cap(ip, 45); // IPv6 máx 45 caracteres
    device = cap(device, 60);
    lang = cap(lang, 20);
    screen = cap(screen, 20);
    referrer = cap(referrer, 300);

    // Usar cabeceras de Vercel como fuente de verdad infalible (los adblockers bloquean la API del frontend)
    const serverIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const serverCountry = req.headers['x-vercel-ip-country'] || 'Desconocido';
    const serverCity = req.headers['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city']) : 'Desconocido';

    if (!ip || ip === '—') ip = serverIp ? serverIp.split(',')[0] : '—';
    if (!country || country === '—') country = serverCountry;
    if (!city || city === '—') city = serverCity;

    const details = [
      `Página: ${page || '/'}`,
      `Fecha: ${ts || '—'}`,
      `País/Ciudad: ${(country || '—')} · ${(city || '—')}`,
      `IP: ${ip || '—'}`,
      `Dispositivo: ${device || '—'}`,
      `Idioma: ${lang || '—'}`,
      `Resolución: ${screen || '—'}`,
      `Referrer: ${referrer || '—'}`,
    ].join(' | ');

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.from('system_logs').insert([{
      admin_id: null,
      user_id: null,
      action: 'SITE_VISIT',
      details,
    }]);

    if (error) throw error;

    res.status(200).json({ status: 'success', message: 'Log registrado' });
  } catch (error) {
    console.error('Error registrando log de visita:', error);
    res.status(500).json({ status: 'error', message: 'Error interno del servidor registrando log' });
  }
};

module.exports = {
  registrarVisita
};
