require('dotenv').config({ path: require('path').resolve(__dirname, '../.env'), override: true });
const TBA_API_KEY = process.env.VITE_AUTH_KEY;

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
 * @param {string} eventCode - TBA event code (e.g. "2024casj")
 * @returns {Promise<Response>} Raw TBA Response object
 * @throws {Error} If the TBA request fails or returns a non-OK status
 */
async function fetchEventDetails(eventCode) {
  const response = await tbaFetch(
    `https://www.thebluealliance.com/api/v3/event/${eventCode}`
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

/**
 * Fetches the list of teams attending an event from The Blue Alliance.
 * @param {string} eventCode - TBA event code (e.g. "2024casj")
 * @returns {Promise<Response>} Raw TBA Response object
 * @throws {Error} If the TBA request fails or returns a non-OK status
 */
async function fetchTeams(eventCode) {
  const response = await tbaFetch(
    `https://www.thebluealliance.com/api/v3/event/${eventCode}/teams/simple`
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

/**
 * Fetches qualification ranking statuses for all teams at an event.
 * @param {string} eventCode - TBA event code (e.g. "2024casj")
 * @returns {Promise<Response>} Raw TBA Response object
 * @throws {Error} If the TBA request fails or returns a non-OK status
 */
async function fetchTeamStatuses(eventCode) {
  const response = await tbaFetch(
    `https://www.thebluealliance.com/api/v3/event/${eventCode}/teams/statuses`
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

/**
 * Fetches raw match data for an event from The Blue Alliance.
 * @param {string} eventCode - TBA event code (e.g. "2024casj")
 * @returns {Promise<Response>} Raw TBA Response object
 * @throws {Error} If the TBA request fails or returns a non-OK status
 */
async function fetchMatchAlliances(eventCode) {
  const response = await tbaFetch(
    `https://www.thebluealliance.com/api/v3/event/${eventCode}/matches`
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

/**
 * Fetches OPR data for an event from The Blue Alliance.
 * @param {string} eventCode - TBA event code (e.g. "2024casj")
 * @returns {Promise<Response>} Raw TBA Response object
 * @throws {Error} If the TBA request fails or returns a non-OK status
 */
async function fetchOPR(eventCode) {
  const response = await tbaFetch(
    `https://www.thebluealliance.com/api/v3/event/${eventCode}/oprs`
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

/**
 * Fetches alliance selections for an event from The Blue Alliance.
 * @param {string} eventCode - TBA event code (e.g. "2024casj")
 * @returns {Promise<Response>} Raw TBA Response object
 * @throws {Error} If the TBA request fails or returns a non-OK status
 */
async function fetchAlliances(eventCode) {
  const response = await tbaFetch(
    `https://www.thebluealliance.com/api/v3/event/${eventCode}/alliances`
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

/**
 * Fetches team EPA data from Statbotics for a given event.
 * @param {string} eventCode - TBA event code (e.g. "2024casj")
 * @returns {Promise<Response>} Raw Statbotics Response object
 * @throws {Error} If the request fails or returns a non-OK status
 */
async function fetchEventEpas(eventCode) {
  const response = await fetch(
    `https://api.statbotics.io/v3/team_events?event=${eventCode}`
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

module.exports = {
  fetchEventDetails,
  fetchTeams,
  fetchTeamStatuses,
  fetchMatchAlliances,
  fetchOPR,
  fetchAlliances,
  fetchEventEpas,
};