const fs = require("fs").promises;
require("dotenv").config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function teamView(eventCode, teamnumber) {
    console.log("Tea");
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("about to call");
    const raw = await fs.readFile("config.json", 'utf8');
    const config = JSON.parse(raw);


    console.log(config);

    finaldata = [];

    for (i =0; i<config.teamview.length; i++) {
        console.log(`Making new query for ${config.teamview[i].columns}`)
        let query = supabaseClient
            .from(eventCode)
            .select(config.teamview[i].columns.toString());

        console.log(`Adding. ${JSON.stringify(config.teamview[i].requirements)}`);
        
        for (const obj of config.teamview[i].requirements) {
            for (const [key, value] of Object.entries(obj)) {
                console.log(key, value);
                query = query.eq(key, value);

            }

        }
        query = query.eq("Team", `frc${teamnumber}`);



        const result = await query;
        // console.log(result);

        matches = {};

        for (let row of result.data) {
            matches[row['Match']] = matches[row['Match']] || [];
            matches[row['Match']].push(row);
        }


        // console.log(matches);
        return result;        
    }
};

module.exports = {
    teamView,
}