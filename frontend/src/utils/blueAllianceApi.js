const apiKey = import.meta.env.VITE_BA_AUTH_KEY;

export async function fetchTeams(eventCode) {
    const apiUrl = `https://www.thebluealliance.com/api/v3/event/${eventCode}/teams/simple`;

    try {
        const response = await fetch(apiUrl, {
            headers: {
                "X-TBA-Auth-Key": apiKey,
            },
        });

        const data = await response.json();
        let _teams = new Map();
        let _teamNumbers = data.map((team) => team.team_number).sort((a, b) => a - b);
        console.log("Fetched team data:", data);
        for (let i = 0; i < data.length; i++) {
            _teams.set(data[i].team_number, data[i].nickname);
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return {_teams, _teamNumbers};
    } catch (error) {
        console.error("There was a problem fetching team data:", error);
        return { _teams: new Map(), _teamNumbers: [] };
    }
}