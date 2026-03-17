const supabaseUtil = require("./supabaseUtil");


supabaseUtil.supabaseInit()
    .then((value) => {supabaseClient = value})
    .catch((error) => console.warn(error));


async function retrieveConfig(eventCode) {

    let game;
    if (eventCode.slice(0, 4) == "2025") {
        game = "REEFSCAPE";
    } else {
        game = "REBUILT";
    }

    const { data, error } = await supabaseClient.storage
        .from('event-configs')
        .download(`${game}.json`);

    return {data, error};
}

module.exports = {
    retrieveConfig
}