require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl =
  process.env.SUPABASE_URL || 'https://dtugdczdrdcoklgjksvw.supabase.co';
const supabaseKey =
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log(`[Database] Supabase Client Initialized: ${supabaseUrl}`);
} else {
  console.warn(
    '[Database] Supabase key not provided yet in server/.env. Telemetry will run in real-time in-memory mode.'
  );
}

module.exports = supabase;
