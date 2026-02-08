const fs = require("fs").promises;
const supabaseUtil = require("./supabaseUtil");
const storage = require("./storage");
require("dotenv").config();

const apiKey = process.env.VITE_AUTH_KEY;

supabaseUtil.supabaseInit()
    .then((value) => {supabaseClient = value})
    .catch((error) => console.warn(error));

async function teamView(teamNumber) {
    let query = supabaseClient
        .from("2026_game")
        .select("*")
        .eq("team", `frc${teamNumber}`);

    const result = await query;
    console.log(result);
    return result;
}

async function getTeamNumbers() {
    let query = supabaseClient
        .from("2026_game")
        .select("team")

    let result = (await query).data
    console.log("result: "+JSON.stringify(result))
    result = result.map((element, _index, _array) => {
        return element.team.slice(3)
    });
    
    console.log(result);
    return result;
}

async function allData(eventCode) {
    let query = supabaseClient
        .from(eventCode)
        .select("*");
    const result = await query;
    return result;
}


async function allTeamsView(eventCode) {
    const {data, error} = await storage.retrieveConfig(eventCode);

    if (parseInt(process.env.USE_CUSTOM_CONFIG)) {
        try {
            const raw = await fs.readFile(`test/${eventCode}-config.json`, 'utf8');
            config = JSON.parse(raw);
        } catch (error) {
            return error;
        }
    } else {
        if (!error) config = JSON.parse(await data.text()) 
        else return error;
    }

    console.log(["Team"].concat(config.teamView[0].columns));

    let query = supabaseClient
        .from(eventCode)
        .select(["Team"].concat(config.teamView[0].columns).toString());
    
    query = query.eq("RecordType", "EndMatch");

    return query;
}


async function availableTeamsView(eventCode) {

    // const {data, error} = await storage.retrieveConfig(eventCode);

    // if (parseInt(process.env.USE_CUSTOM_CONFIG)) {
    //     try {
    //         const raw = await fs.readFile(`test/${eventCode}-config.json`, 'utf8');
    //         config = JSON.parse(raw);
    //     } catch (error) {
    //         return error;
    //     }
    // } else {
    //     if (!error) config = JSON.parse(await data.text()) 
    //     else return error;
    // }

    let query = supabaseClient
        .from(eventCode)
        .select("team");
    
    query = await query;
    console.log(query);
    const queryData = query.data;
    console.log(queryData);

    let teams = [];
    for (let team_ of queryData) {
        const teamNumber = parseInt(team_.team.slice(3));
        teams.push(teamNumber);
    }

    teams = [...new Set(teams)];

    return teams;

}


module.exports = {
    allData,
    getTeamNumbers,
    teamView,
    allTeamsView,
    availableTeamsView
}