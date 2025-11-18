// Imports
const express = require("express");
const dotenv = require("dotenv");

// Initializing packages
const app = express();
dotenv.config();

// env constants 
const PORT = process.env.PORT;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Supabase fetch
async function supabaseFetch() {
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data, error } = await supabaseClient
        .from("Activity")
        .select("*")
        .limit(1);

    if (error) {
        throw error;
    } else {
        return data;
    }
};

// Simple sending data upon GET
app.get("/database", (req, res) => {
    const data = supabaseFetch()
        .then(data => {
            res.send(data);
        })
        .catch(err => console.error(err));
        
});

app.listen(PORT);