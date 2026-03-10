const TBA_API_KEY = import.meta.env.VITE_AUTH_KEY;
const VITE_TESTING = import.meta.env.VITE_TESTING || 1;
const VITE_BACKEND_PORT = import.meta.env.VITE_BACKEND_PORT || 8000;
const SERVER = !parseInt(VITE_TESTING) ? import.meta.env.VITE_SERVER_IP : "localhost";


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
    let _teamNumbers = data
      .map((team) => team.team_number)
      .sort((a, b) => a - b);
    console.log("Fetched team data:", data);
    for (let i = 0; i < data.length; i++) {
      _teams.set(data[i].team_number, data[i].nickname);
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return { _teams, _teamNumbers };
  } catch (error) {
    console.error("There was a problem fetching team data:", error);
    return { _teams: new Map(), _teamNumbers: [] };
  }
}


export async function fetchMatchAlliances(eventCode) {
  if (!eventCode) {
    return {};
  }
  try {
    // const res = await fetch(
    //   `https://www.thebluealliance.com/api/v3/event/${eventCode}/matches`,
    //   {
    //     headers: { "X-TBA-Auth-Key": TBA_API_KEY },
    //   },
    // );

    const route = `http://${SERVER}:${VITE_BACKEND_PORT}/getMatchData?eventCode=` + eventCode;
    let res = await fetch(route);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();

    console.log(data);

    const result = {};
    data.forEach((match) => {
      if (match.comp_level !== "qm") return;
      const num = match.match_number;
      result[num] = {
        red: (match.alliances.red.team_keys ?? []).map((k) =>
          k.replace("frc", ""),
        ),
        blue: (match.alliances.blue.team_keys ?? []).map((k) =>
          k.replace("frc", ""),
        ),
        redScore: match.score_breakdown?.red?.hubScore?.totalCount ?? null,
        blueScore: match.score_breakdown?.blue?.hubScore?.totalCount ?? null,
      };
    });
    return result;
  } catch (e) {
    console.error("Error fetching match alliances:", e);
    return {};
  }
}

export async function fetchOPR(eventCode) {
  return fetch(
    `https://www.thebluealliance.com/api/v3/event/${eventCode}/oprs`,
    {
      headers: {
        "X-TBA-Auth-Key": TBA_API_KEY,
      },
    },
  );
}

export async function fetchWinners(eventCode) {
  const apiUrl = `https://www.thebluealliance.com/api/v3/team/frc${eventCode}`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        "X-TBA-Auth-Key": TBA_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // retrieve winners
  } catch (error) {
    console.error("There was a problem fetching team data:", error);
  }
}

export async function fetchMatchScores(eventCode, match, teamNumber) {
  let tbaScore = null;
  try {
    const response = await fetch(
      `https://www.thebluealliance.com/api/v3/event/${eventCode}/matches`,
      {
        headers: { "X-TBA-Auth-Key": TBA_API_KEY },
      },
    );

    if (!response.ok) {
      console.warn(`TBA fetch failed:`, response.status);
      return null;
    }

    const allMatches = await response.json();
    const matchKey = `${eventCode}_qm${match.Match}`;
    const alliance = match.DriveStation.startsWith("red") ? "red" : "blue";
    const tbaMatch = allMatches.find((m) => m.key === matchKey);

    if (!tbaMatch) {
      console.warn(`Match ${matchKey} not found in event data`);
      return null;
    }

    tbaScore = tbaMatch.alliances[alliance].score;
  } catch (error) {
    console.error(`Error fetching match scores:`, error);
  }
  return tbaScore;
}
/**
 * Fetches alliances for an event and returns whether they have been posted.
 * @param {string} eventCode
 * @returns {Promise<boolean>} true if alliances are posted with picks, false otherwise
 */
export async function fetchAlliancesAvailable(eventCode) {
  if (!eventCode) return false;
  try {
    const response = await fetch(
      `https://www.thebluealliance.com/api/v3/event/${eventCode}/alliances`,
      { headers: { "X-TBA-Auth-Key": TBA_API_KEY } },
    );
    if (!response.ok) return false;
    const data = await response.json();
    return Array.isArray(data) && data.length > 0 && data[0]?.picks?.length > 0;
  } catch (error) {
    console.error("There was a problem fetching alliance data:", error);
    return false;
  }
}

/**
 * Fetches the full alliance list for an event.
 * @param {string} eventCode
 * @returns {Promise<Array>} array of alliance objects from TBA, or empty array on failure
 */
export async function fetchAlliances(eventCode) {
  if (!eventCode) return [];
  try {
    const response = await fetch(
      `https://www.thebluealliance.com/api/v3/event/${eventCode}/alliances`,
      { headers: { "X-TBA-Auth-Key": TBA_API_KEY } },
    );
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("There was a problem fetching alliance data:", error);
    return [];
  }
}

/**
 * Returns true if at least one elimination match has been played IRL.
 * Uses the TBA /event/{code}/matches endpoint and checks for sf/ef/f matches
 * that have a winning alliance (i.e. actual_time is set and winning_alliance is non-empty).
 * @param {string} eventCode
 * @returns {Promise<boolean>}
 */
export async function fetchElimsHaveStarted(eventCode) {
  if (!eventCode) return false;
  try {
    const response = await fetch(
      `https://www.thebluealliance.com/api/v3/event/${eventCode}/matches`,
      { headers: { "X-TBA-Auth-Key": TBA_API_KEY } },
    );
    if (!response.ok) return false;
    const matches = await response.json();
    return matches.some(
      (m) =>
        (m.comp_level === "sf" ||
          m.comp_level === "ef" ||
          m.comp_level === "f") &&
        m.winning_alliance !== "" &&
        m.winning_alliance !== null,
    );
  } catch (error) {
    console.error("There was a problem checking elim matches:", error);
    return false;
  }
}
