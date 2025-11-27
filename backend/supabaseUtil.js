require("dotenv").config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function supabaseInit() {
    const { createClient } = (await import("@supabase/supabase-js"));
    return createClient(SUPABASE_URL, SUPABASE_KEY);    
}

module.exports = {
    supabaseInit
}