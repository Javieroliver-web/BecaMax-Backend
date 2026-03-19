const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://tu-url-de-supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'tu-service-key-oculta';
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
