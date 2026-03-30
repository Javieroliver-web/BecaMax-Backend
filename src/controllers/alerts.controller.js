const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const BECAS_ESTATICAS = require('../data/becas');

const initSupabaseAdmin = () => {
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
};

// Lógica de validación del Frontend (app.js replicada para que decida qué enviar)
function diasRestantes(deadline) {
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const fin = new Date(deadline);
    return Math.ceil((fin - hoy) / 86400000);
}

function aplicarFiltros(becas, filtros) {
    const { busqueda, tipo, region, area, importeMin, importeMax, plazo } = filtros;
    
    return becas.filter(b => {
        const dias = diasRestantes(b.deadline);
        let u = 'disponible';
        if (dias < 0) u = 'cerrada';
        else if (dias <= 7) u = 'urgente';
        else if (dias <= 30) u = 'proximo';

        if (dias < 0) return false; // Nunca enviar becas cerradas en emails!

        if (tipo && b.tipo !== tipo) return false;
        if (region && b.region !== region && b.region !== 'Nacional') return false;
        if (area && b.area !== area && b.area !== 'Cualquier área') return false;
        if (importeMin !== null && b.importe && b.importe.max < importeMin) return false;
        if (importeMax !== null && b.importe && b.importe.min > importeMax) return false;

        if (plazo === 'urgente' && u !== 'urgente') return false;
        if (plazo === 'proximo' && u !== 'proximo') return false;

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

const sendAlertsCron = async (req, res) => {
    try {
        // En Vercel configuramos un CRON_SECRET como header Authorization Bearer
        const authHeader = req.headers.authorization;
        const cronSecret = process.env.CRON_SECRET;
        
        // Proteccion del endpoint
        if (cronSecret && (!authHeader || authHeader !== `Bearer ${cronSecret}`)) {
            return res.status(401).json({ status: 'error', message: 'Cron Secret inválido o ausente' });
        }

        const resendApiKey = process.env.RESEND_API_KEY;
        if (!resendApiKey) {
            return res.status(500).json({ status: 'error', message: 'RESEND_API_KEY no está definida.' });
        }
        const resend = new Resend(resendApiKey);

        const supabase = initSupabaseAdmin();

        // 1. Obtener todas las Becas de BD, o usar static fallback
        let dataBecas = [];
        const { data: bData, error: bError } = await supabase.from('becas').select('*');
        if (bError || !bData || bData.length === 0) {
            console.log("No se encontraron becas en BD. Usando BECAS_ESTATICAS.");
            dataBecas = BECAS_ESTATICAS;
        } else {
            console.log(`Leídas ${bData.length} becas de la base de datos.`);
            dataBecas = bData;
        }

        // 2. Obtener TODAS las alertas guardadas que estén activas
        const { data: alertas, error: alertaErr } = await supabase
            .from('filtros_guardados')
            .select('*')
            .eq('activo', true);

        if (alertaErr) throw alertaErr;
        
        if (!alertas || alertas.length === 0) {
            return res.json({ status: 'success', message: 'No hay alertas activas para procesar.' });
        }

        // 3. Extraer lista de user_ids únicas
        const userIds = [...new Set(alertas.map(a => a.user_id))];

        // 4. Obtener emails de auth.users usando la Service Key
        const correosMapa = {};
        for (const uid of userIds) {
            const { data: { user }, error: userErr } = await supabase.auth.admin.getUserById(uid);
            if (user && user.email) {
                correosMapa[uid] = user.email;
            }
        }

        let emailsEnviados = 0;
        const resumenLogs = [];

        // 5. Procesar cada alerta
        for (const alerta of alertas) {
            const destEmail = correosMapa[alerta.user_id];
            if (!destEmail) continue;

            const becasMatch = aplicarFiltros(dataBecas, alerta.filtros);

            if (becasMatch.length > 0) {
                // Montar HTML
                let htmlBecas = becasMatch.map(b => `
                    <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
                        <h3 style="margin: 0; color: #10b981;">${b.nombre}</h3>
                        <p style="margin: 5px 0;"><strong>Entidad:</strong> ${b.entidad}</p>
                        <p style="margin: 5px 0;"><strong>Importe Máx:</strong> ${b.importe ? b.importe.max : '?'} €</p>
                        <p style="margin: 5px 0;"><strong>Plazo:</strong> ${new Date(b.deadline).toLocaleDateString()}</p>
                        <a href="${b.url}" style="display:inline-block; margin-top:10px; padding: 8px 12px; background: #8b5cf6; color: white; text-decoration: none; border-radius: 4px;">Ver Beca Completa</a>
                    </div>
                `).join('');

                const template = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="text-align:center; color: #111;">🎯 BecaMax – Tienes nuevas oportunidades</h2>
                        <p>Hemos encontrado <strong>${becasMatch.length} becas</strong> activas y abierrtas que encajan con tu alerta: <b>"${alerta.nombre}"</b>.</p>
                        <hr style="border:0; border-top: 1px solid #eee; margin: 20px 0;">
                        ${htmlBecas}
                        <p style="font-size: 12px; color: #888; text-align:center; margin-top:30px;">
                            Recibes este email porque creaste una alerta en BecaMax. <br>
                            Si deseas dejar de recibir avisos, entra a tu panel y desactiva la alerta.
                        </p>
                    </div>
                `;

                try {
                    // Cuidado: En la capa gratuita de Resend, solo deja enviar mensajes a una dirección de email autorizada, o tu dominio personal configurado.
                    const sendRes = await resend.emails.send({
                        from: 'BecaMax Alertas <onboarding@resend.dev>',
                        to: destEmail,
                        subject: `Tienes ${becasMatch.length} nuevas becas de tu alerta: ${alerta.nombre}`,
                        html: template
                    });
                    resumenLogs.push({ email: destEmail, alerta: alerta.nombre, matches: becasMatch.length, status: 'enviado' });
                    emailsEnviados++;
                } catch (emailErr) {
                    console.error('Fallo al enviar a:', destEmail, emailErr.message);
                }
            }
        }

        res.status(200).json({ 
            status: 'success', 
            message: 'Proceso CRON finalizado', 
            emailsEnviados, 
            resumenLogs 
        });

    } catch (error) {
        console.error('Error total en sendAlertsCron:', error);
        res.status(500).json({ status: 'error', message: error.message || 'Error interno' });
    }
};

module.exports = {
    sendAlertsCron
};
