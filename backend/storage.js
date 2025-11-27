const supabaseUtil = require("./supabaseUtil");


supabaseUtil.supabaseInit()
    .then((value) => {supabaseClient = value})
    .catch((error) => console.warn(error));


async function retrieveConfig(eventCode) {
    const { data, error } = await supabaseClient.storage
        .from('event-configs')
        .download(`${eventCode}-config.json`);

    return {data, error};
}

module.exports = {
    retrieveConfig
}