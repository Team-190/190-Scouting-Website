const fs = require("fs").promises;
const supabaseUtil = require("./supabaseUtil");
const storage = require("./storage");


supabaseUtil.supabaseInit()
    .then((value) => {supabaseClient = value})
    .catch((error) => console.warn(error));


async function teamView(eventCode, teamnumber) {
    console.log("About to call");
    const config = await storage.retrieveConfig(eventCode);

    console.log(config);

    for (let i = 0; i < config.teamView.length; i++) {
        console.log(`Making new query for ${config.teamView[i].columns}`)
        let query = supabaseClient
            .from(eventCode)
            .select(config.teamView[i].columns.toString());

        console.log(`Adding. ${JSON.stringify(config.teamView[i].requirements)}`);
        
        for (const obj of config.teamView[i].requirements) {
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


function allTeamsView(eventCode, column) {
    console.log(`Querying ${column}`);
    let query = supabaseClient
        .from(eventCode)
        .select(["Team", "Match", column].toString());
    
    query = query.eq("RecordType", "EndMatch");

    return query;
}


module.exports = {
    teamView,
    allTeamsView
}