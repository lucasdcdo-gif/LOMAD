
import { createClient } from '@supabase/supabase-js';

/**
 * Checks if Supabase is configured via environment variables.
 * We expect VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to be set.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const SUPABASE_CONFIGURED = Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'));

// Inicializa o cliente com as credenciais do ambiente
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        debug: false, // PRODUCTION: Disable debug to prevent token exposure
        persistSession: true,
        autoRefreshToken: true,
    }
});
