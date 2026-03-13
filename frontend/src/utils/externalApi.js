const TBA_API_KEY = import.meta.env.VITE_AUTH_KEY;
const VITE_TESTING = import.meta.env.VITE_TESTING || 1;
const VITE_BACKEND_PORT = import.meta.env.VITE_BACKEND_PORT || 8000;
const SERVER = !parseInt(VITE_TESTING)
  ? import.meta.env.VITE_SERVER_IP
  : "localhost";

// ─── HELPERS ────────────────────────────────────────────────────────────────

/**
 * Wrapper around fetch() that attaches the TBA auth header.
 * @param {string} url
 * @returns {Promise<Response>}
 */
async function tbaFetch(url) {
  return fetch(url, { headers: { "X-TBA-Auth-Key": TBA_API_KEY } });
}

// ─── THE BLUE ALLIANCE ──────────────────────────────────────────────────────

/**
 * Fetches event details from The Blue Alliance API.
 *
 * @param {string} eventCode - TBA event code (e.g. "2024casj")
 * @returns {Promise<{name: string, short_name: string, location: string}>}
 */
export async function fetchEventDetails(eventCode) {
  try {
    const response = await tbaFetch(
      `https://www.thebluealliance.com/api/v3/event/${eventCode}`
    );

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    return {
      name: data.name,
      short_name: data.short_name,
      location: data.location,
    };
  } catch (error) {
    console.error(`Failed to fetch event details for ${eventCode}:`, error);
    return { name: eventCode, short_name: eventCode, location: "" };
  }
}

/**
 * Fetches the list of teams attending an event.
 *
 * @param {string} eventCode - TBA event code (e.g. "2024casj")
 * @returns {Promise<{ _teams: Map<number, string>, _teamNumbers: number[] }>}
 *
 * _teams:       Map of team_number → nickname
 *               e.g. Map { 254 => "The Cheesy Poofs", 1678 => "Citrus Circuits" }
 *
 * _teamNumbers: Sorted array of team numbers
 *               e.g. [254, 1678, 2910, ...]
 */
export async function fetchTeams(eventCode) {
  try {
    const response = await tbaFetch(
      `https://www.thebluealliance.com/api/v3/event/${eventCode}/teams/simple`
    );

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();

    const _teams = new Map(data.map((team) => [team.team_number, team.nickname]));
    const _teamNumbers = data.map((t) => t.team_number).sort((a, b) => a - b);

    return { _teams, _teamNumbers };
  } catch (error) {
    console.error("There was a problem fetching team data:", error);
    return { _teams: new Map(), _teamNumbers: [] };
  }
}

/**
 * Fetches qualification ranking statuses for all teams at an event.
 *
 * @param {string} eventCode - TBA event code (e.g. "2024casj")
 * @returns {Promise<{ _teamRanks: Map<number, number | null> }>}
 *
 * _teamRanks: Map of team_number → qualification rank (or null if unranked)
 *             e.g. Map { 254 => 1, 1678 => 2, 9999 => null }
 */
export async function fetchTeamStatuses(eventCode) {
  try {
    const response = await tbaFetch(
      `https://www.thebluealliance.com/api/v3/event/${eventCode}/teams/statuses`
    );

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();

    const _teamRanks = new Map(
      Object.entries(data).map(([teamKey, status]) => [
        parseInt(teamKey.replace("frc", "")),
        status?.qual?.ranking?.rank ?? null,
      ])
    );

    return { _teamRanks };
  } catch (error) {
    console.error("There was a problem fetching team statuses:", error);
    return { _teamRanks: new Map() };
  }
}

/**
 * Fetches qualification match alliance data for an event from the local backend.
 *
 * @param {string} eventCode - TBA event code (e.g. "2024casj")
 * @returns {Promise<Object>} Map of match_number → alliance data
 *
 * Return shape:
 * {
 *   [matchNumber]: {
 *     red:       string[],   // e.g. ["254", "1678", "2910"]
 *     blue:      string[],   // e.g. ["118", "148", "330"]
 *     redScore:  number | null,
 *     blueScore: number | null
 *   }
 * }
 *
 * Returns {} on failure.
 */
export async function fetchMatchAlliances(eventCode) {
  if (!eventCode) return {};

  try {
    const response = await fetch(
      `http://${SERVER}:${VITE_BACKEND_PORT}/getMatchData?eventCode=${eventCode}`
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    return Object.fromEntries(
      data
        .filter((match) => match.comp_level === "qm")
        .map((match) => [
          match.match_number,
          {
            red: (match.alliances.red.team_keys ?? []).map((k) => k.replace("frc", "")),
            blue: (match.alliances.blue.team_keys ?? []).map((k) => k.replace("frc", "")),
            redScore: match.score_breakdown?.red?.hubScore?.totalCount ?? null,
            blueScore: match.score_breakdown?.blue?.hubScore?.totalCount ?? null,
          },
        ])
    );
  } catch (error) {
    console.error("Error fetching match alliances:", error);
    return {};
  }
}

/**
 * Fetches OPR (Offensive Power Rating) data for an event.
 *
 * @param {string} eventCode - TBA event code (e.g. "2024casj")
 * @returns {Promise<{ oprs: Object, dprs: Object, ccwms: Object }>}
 *
 * {
 *   oprs:  { [teamKey: string]: number },   // e.g. { "frc254": 72.3 }
 *   dprs:  { [teamKey: string]: number },
 *   ccwms: { [teamKey: string]: number }
 * }
 *
 * Returns { oprs: {}, dprs: {}, ccwms: {} } on failure.
 */
export async function fetchOPR(eventCode) {
  if (!eventCode) return { oprs: {}, dprs: {}, ccwms: {} };

  try {
    const response = await tbaFetch(
      `https://www.thebluealliance.com/api/v3/event/${eventCode}/oprs`
    );

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();

    return {
      oprs: data.oprs ?? {},
      dprs: data.dprs ?? {},
      ccwms: data.ccwms ?? {},
    };
  } catch (error) {
    console.error("There was a problem fetching OPR data:", error);
    return { oprs: {}, dprs: {}, ccwms: {} };
  }
}

/**
 * Fetches the score for a specific team's match from TBA.
 *
 * @param {string} eventCode   - TBA event code (e.g. "2024casj")
 * @param {{ Match: number, DriveStation: string }} match
 *   match.Match:        qualification match number
 *   match.DriveStation: drive station string, must start with "red" or "blue"
 * @param {number} teamNumber  - team number (unused internally, kept for caller context)
 * @returns {Promise<number | null>} Alliance score for that match, or null on failure
 */
export async function fetchMatchScores(eventCode, match, teamNumber) {
  try {
    const response = await tbaFetch(
      `https://www.thebluealliance.com/api/v3/event/${eventCode}/matches`
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

    return tbaMatch.alliances[alliance].score;
  } catch (error) {
    console.error(`Error fetching match scores:`, error);
    return null;
  }
}

/**
 * Checks whether alliance selections have been posted for an event.
 *
 * @param {string} eventCode - TBA event code (e.g. "2024casj")
 * @returns {Promise<boolean>} true if alliances are posted with picks, false otherwise
 */
export async function fetchAlliancesAvailable(eventCode) {
  if (!eventCode) return false;

  try {
    const response = await tbaFetch(
      `https://www.thebluealliance.com/api/v3/event/${eventCode}/alliances`
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
 *
 * @param {string} eventCode - TBA event code (e.g. "2024casj")
 * @returns {Promise<Array>} Array of alliance objects, or [] on failure
 *
 * Each alliance object:
 * {
 *   name:    string,     // e.g. "Alliance 1"
 *   captain: string,     // e.g. "frc254"
 *   picks:   string[],   // e.g. ["frc1678", "frc2910"]
 *   declines: string[]
 * }
 */
export async function fetchAlliances(eventCode) {
  if (!eventCode) return [];

  try {
    const response = await tbaFetch(
      `https://www.thebluealliance.com/api/v3/event/${eventCode}/alliances`
    );
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("There was a problem fetching alliance data:", error);
    return [];
  }
}

/**
 * Checks whether elimination matches have started for an event.
 *
 * @param {string} eventCode - TBA event code (e.g. "2024casj")
 * @returns {Promise<boolean>} true if at least one elim match has a recorded result
 */
export async function fetchElimsHaveStarted(eventCode) {
  if (!eventCode) return false;

  try {
    const response = await tbaFetch(
      `https://www.thebluealliance.com/api/v3/event/${eventCode}/matches`
    );
    if (!response.ok) return false;
    const matches = await response.json();
    return matches.some(
      (m) =>
        ["sf", "ef", "f"].includes(m.comp_level) &&
        m.winning_alliance !== "" &&
        m.winning_alliance !== null
    );
  } catch (error) {
    console.error("There was a problem checking elim matches:", error);
    return false;
  }
}

// ─── STATBOTICS ─────────────────────────────────────────────────────────────

/**
 * Fetches team EPA (Expected Points Added) data from Statbotics for a given event.
 *
 * @param {string} eventCode - TBA event code (e.g. "2024casj")
 * @returns {Promise<Array>} Array of team stat objects, or [] on failure
 *
 * Each object:
 * {
 *   team:  254,            // team number (number)
 *   event: "2024casj",     // event code (string)
 *   epa: {
 *     total_points: { mean: 72.3, sd: 4.1 },  // total EPA
 *     auto:         { mean: 20.1, sd: 2.0 },
 *     teleop:       { mean: 40.2, sd: 3.1 },
 *     endgame:      { mean: 12.0, sd: 1.5 },
 *     stats: {
 *       mean: 72.3,   // mirrors total_points.mean
 *       sd:   4.1
 *     }
 *   },
 *   record: { wins: 8, losses: 2, ties: 0 },
 *   rank:   1              // qual rank (number | null)
 * }
 */
export async function fetchEventEpas(eventCode) {
  try {
    const response = await fetch(
      `https://api.statbotics.io/v3/team_events?event=${eventCode}`
    );

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("No EPA data available for this event.");
    }

    return data;
  } catch (error) {
    console.error("There was a problem fetching EPA data:", error);
    return [];
  }
}