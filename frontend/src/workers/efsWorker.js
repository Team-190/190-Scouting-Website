/**
 * Web Worker for computing EFS (Estimated Fuel Score) data
 * Runs CPU-intensive calculations off the main thread
 */

// Inline implementation of estimateTeamPoints for the worker
function estimateTeamPoints(teamNumber, matchNumber, alliances, data) {
  const match = alliances.find(
    (m) => m.match_number === matchNumber && m.comp_level === "qm"
  );
  if (!match) return null;

  let allianceColor = null;
  ["red", "blue"].forEach((color) => {
    const teamKeys = match.alliances[color].team_keys;
    if (teamKeys.includes(`frc${teamNumber}`)) {
      allianceColor = color;
    }
  });

  if (!allianceColor) return null;

  const allTeamsData = data;
  const teamMateupsWithData = allTeamsData.filter((row) => {
    const rowTeam = String(row.Team || row.team || "").replace(/^frc/, "");
    return rowTeam === String(teamNumber) && Number(row.Match) === matchNumber;
  });

  let totalScore = 0;
  if (teamMateupsWithData.length > 0) {
    const row = teamMateupsWithData[0];
    const fuelScored = Number(row.FuelShootingTime || 0) || 0;
    totalScore = fuelScored;
  }

  return totalScore > 0 ? totalScore : null;
}

// Listen for messages from the main thread
self.onmessage = function (event) {
  const { type, payload } = event.data;

  if (type === "computeEFS") {
    const { teams, matchNumber, alliances, data } = payload;
    const results = {};

    for (const team of teams) {
      results[team] = estimateTeamPoints(team, matchNumber, alliances, data);
    }

    // Send results back to main thread
    self.postMessage({ type: "efsResults", results });
  }
};
