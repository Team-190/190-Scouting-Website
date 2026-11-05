export const SCOUT_STATIONS = ["R1", "R2", "R3", "B1", "B2", "B3"];
export const STARTING_LOCATIONS = ["Far Trench", "Far Bump", "Hub", "Near Bump", "Near Trench"];

export const DEFENSE_TYPE_OPTIONS = [
  "Pushing (hitting a robot to disrupt their aim)",
  "Pinning (Stopping robots from moving so they couldn't aim)",
  "Blocking (Getting in their way preventing motion across zones)",
];

export const MATCH_EVENT_OPTIONS = [
  "Lost mechanism",
  "Stopped moving (full match)",
  "Stopped moving (5+ seconds)",
  "Tipped over",
  "Yellow card",
  "Red card",
  "No Show",
];

const STATION_LOOKUP: Record<string, { alliance: string; index: number }> = {
  R1: { alliance: "red", index: 0 },
  R2: { alliance: "red", index: 1 },
  R3: { alliance: "red", index: 2 },
  B1: { alliance: "blue", index: 0 },
  B2: { alliance: "blue", index: 1 },
  B3: { alliance: "blue", index: 2 },
};

export type Phase = "auto" | "teleop" | "questions" | "done";

export type ScoutingQuestions = {
  defenseTypes: string[];
  defenseEffectiveness: number | null;
  defenseComments: string;
  avoidanceTypes: string[];
  avoidanceEffectiveness: number | null;
  avoidanceComments: string;
  matchEvents: string[];
  otherComments: string;
};

export function getDefaultQuestions(): ScoutingQuestions {
  return {
    defenseTypes: [],
    defenseEffectiveness: null,
    defenseComments: "",
    avoidanceTypes: [],
    avoidanceEffectiveness: null,
    avoidanceComments: "",
    matchEvents: [],
    otherComments: "",
  };
}

export type MatchAssignment = {
  comp_level?: string;
  match_number?: number;
  alliances?: Partial<Record<"red" | "blue", { team_keys?: string[] }>>;
};

export function resolveAssignedTeam(matchNum: number, station: string, allMatches: MatchAssignment[]) {
  const stationConfig = STATION_LOOKUP[station];
  if (!stationConfig || !Array.isArray(allMatches) || allMatches.length === 0) return "";

  const qualMatch = allMatches.find(
    (m) => m?.comp_level === "qm" && Number(m?.match_number) === Number(matchNum),
  );
  if (!qualMatch) return "";

  const teamKey = qualMatch?.alliances?.[stationConfig.alliance]?.team_keys?.[stationConfig.index];
  if (typeof teamKey !== "string") return "";

  return teamKey.replace(/^frc/i, "");
}

