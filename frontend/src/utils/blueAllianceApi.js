const TBA_API_KEY = import.meta.env.VITE_AUTH_KEY;

export async function fetchTeams(eventCode) {
    const apiUrl = `https://www.thebluealliance.com/api/v3/event/${eventCode}/teams/simple`;

    try {
        const response = await fetch(apiUrl, {
            headers: {
                "X-TBA-Auth-Key": TBA_API_KEY,
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


export async function fetchOPR(eventCode) {
    return fetch(`https://www.thebluealliance.com/api/v3/event/${eventCode}/oprs`, {
        headers: {
            'X-TBA-Auth-Key': TBA_API_KEY
        }
    });
}

export async function fetchWinners(eventCode) {
    const apiUrl = `https://www.thebluealliance.com/api/v3/team/frc${eventCode}`;

    try {
        const response = await fetch(apiUrl, {
        headers: {
            "X-TBA-Auth-Key": TBA_API_KEY
        }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }


        // retrieve winners

    } catch (error) {
        console.error('There was a problem fetching team data:', error);
    }
}