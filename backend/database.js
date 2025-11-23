const fs = require("fs").promises;
require("dotenv").config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function teamView() {
    console.log("Tea")
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("about to call")
    const raw = await fs.readFile("config.json", 'utf8');
    const config = JSON.parse(raw);


    console.log(config);

    finaldata = [];

    for (i =0; i<config.teamview.length; i++) {
        let query = supabaseClient
            .from("Activity")
            .select(config.teamview[i].columns)
        console.log("Adding")
        for (const { col, val } of config.teamview[i].requirements) {
            console.log(col,val);
            query = query.eq(col, val);
        }

        console.log(query);
        
        if (error) {
            throw error;
        } else {
            finaldata = finaldata.concat(data);
        }
    }
};

module.exports = {
    teamView,
}