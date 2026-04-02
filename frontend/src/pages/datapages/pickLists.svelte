<script>
  import baseX from "base-x";
  import pako from "pako";
  import { onMount } from "svelte";
  import { writable } from "svelte/store";
  import Team from "../../components/Team.svelte";
  import TeamHoverCard from "../../components/TeamHoverCard.svelte";
  import {
      fetchEventEpas,
      fetchOPR,
      fetchTeamStatuses,
      fetchTeams,
  } from "../../utils/api.js";
  import { getIndexedDBStore } from '../../utils/indexedDB';
  import {
      BOOLEAN_METRICS,
      CLIMBSTATE_METRIC,
      EXCLUDED_FIELDS,
      METADATA_KEYS,
      loadFromStorage,
      mean,
      percentile,
      saveToStorage,
      sd
  } from "../../utils/pageUtils";

  // ─── CONSTANTS ──────────────────────────────────────────────────────────────

  const BASE85_CHARS =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
  const bs85 = baseX(BASE85_CHARS);

  // ─── STORES ─────────────────────────────────────────────────────────────────

  let teamsStore = writable({
    _teams: new Map(),
    _teamNumbers: [],
    _teamRanks: new Map(),
  });

  // ─── PERSISTENT STATE ────────────────────────────────────────────────────────

  let eventCode = $state(localStorage.getItem("eventCode"));

  $effect(() => {
    localStorage.setItem("eventCode", eventCode);
  });

  let picklists = $state(loadFromStorage("picklists", {}));
  let allianceSelections = $state(
    loadFromStorage("allianceSelections", {
      default: {
        name: "Default",
        alliances: makeEmptyAlliances(),
      },
    }),
  );

  $effect(() => {
    saveToStorage("picklists", picklists);
  });

  $effect(() => {
    saveToStorage("allianceSelections", allianceSelections);
  });

  // ─── UI STATE ────────────────────────────────────────────────────────────────

  let draggedItem = $state(null);
  let newPickListName = $state("");
  let pickedTeams = $state({});
  let importData = $state("");
  let editingPicklistId = $state(null);
  let editingPicklistName = $state("");
  let alliances = $state(makeEmptyAlliances());
  let activeView = $state("picklists");
  let rankedTeams = $state([]);
  let isFourTeamAlliance = $state(false);
  let activeAllianceSelectionId = $state("default");
  let newAllianceSelectionName = $state("");
  let editingAllianceSelectionId = $state(null);
  let editingAllianceSelectionName = $state("");
  let allianceImportData = $state("");

  // ─── HOVERCARD STATE ─────────────────────────────────────────────────────────

  let hoveredTeam = $state(null);
  let hoverAnchorEl = $state(null);
  let hoverVisible = $state(false);
  let cachedOPRs = $state({});
  let cachedRobotPics = $state({});

  /** Extract flat values from the merged [auto, full] storage format */
  function extractValues(data) {
    return data.map((row) => {
      const flat = {};
      for (const key of Object.keys(row)) {
        const val = row[key];
        flat[key] = METADATA_KEYS.has(key)
          ? val
          : Array.isArray(val) && val.length === 2
            ? val[1]
            : val;
      }
      return flat;
    });
  }

  // ─── LOAD SCOUTING DATA FROM INDEXEDDB ───────────────────────────────────────

  let teamViewData = $state([]);

  async function loadTeamViewData() {
    try {
      const raw = await getIndexedDBStore("scoutingData") || [];
      if (!raw || !raw.length) {
        teamViewData = [];
        return;
      }
      // IDB rows have [auto, full] tuple format — same as localStorage
      // extractValues unwraps tuples to take the full (index 1) value
      teamViewData = extractValues(raw);
      console.log("[hovercard debug] sample extracted row:", teamViewData[0]);
    } catch (e) {
      console.error("Failed to load scouting data from IndexedDB:", e);
      teamViewData = [];
    }
  }

  // Pre-processed data passed to hovercard
  let teamAggCache = $state({});
  let hovercardGlobalStats = $state({});

  // Load once on mount
  onMount(async () => {
    await loadTeamViewData();
    buildHovercardCache();
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  });

  // ─── BUILD HOVERCARD CACHE ───────────────────────────────────────────────────
  function buildHovercardCache() {
    if (!teamViewData?.length) return;

    const META = new Set([
      "Match",
      "Team",
      "team",
      "Id",
      "Time",
      "RecordType",
      "Mode",
      "DriveStation",
      "ScouterName",
      "ScouterError",
    ]);
    const ZONE = new Set([
      "NearBlueZoneTime",
      "FarBlueZoneTime",
      "NearNeutralZoneTime",
      "FarNeutralZoneTime",
      "NearRedZoneTime",
      "FarRedZoneTime",
    ]);

    function isNum(n) {
      if (n === null || n === undefined || n === "" || typeof n === "boolean")
        return false;
      return !isNaN(parseFloat(n)) && isFinite(n);
    }

    function aggregateMatches(rawData) {
      const grouped = {};
      rawData.forEach((row) => {
        const m = row.Match;
        if (!m) return;
        if (!grouped[m]) grouped[m] = [];
        grouped[m].push(row);
      });
      // Per match, pick only the single highest-Id record
      // (multiple scouts submit EndMatch — we just want one)
      for (const m of Object.keys(grouped)) {
        const rows = grouped[m].sort(
          (a, b) => (Number(b.Id) || 0) - (Number(a.Id) || 0),
        );
        grouped[m] = [rows[0]];
      }
      return Object.keys(grouped)
        .map((matchNum) => {
          const rows = grouped[matchNum].sort(
            (a, b) => (Number(a.Id) || 0) - (Number(b.Id) || 0),
          );
          const agg = { ...rows[0] };
          const allKeys = new Set();
          rows.forEach((r) =>
            Object.keys(r).forEach((k) => {
              if (!META.has(k)) allKeys.add(k);
            }),
          );
          const state = {};
          allKeys.forEach((k) => {
            state[k] = { type: "none", val: 0 };
          });
          rows.forEach((row) => {
            allKeys.forEach((key) => {
              const v = row[key];
              if (
                v === -1 ||
                v === "-1" ||
                v === "-" ||
                v === null ||
                v === undefined ||
                v === ""
              )
                return;
              const s = state[key];
              if (ZONE.has(key)) {
                if (isNum(v)) {
                  s.type = "numeric";
                  s.val = Number(v);
                }
              } else if (s.type === "string") {
                if (!isNum(v)) s.val = v;
              } else if (s.type === "numeric") {
                if (isNum(v)) s.val += Number(v);
                else {
                  s.type = "string";
                  s.val = v;
                }
              } else {
                if (isNum(v)) {
                  s.type = "numeric";
                  s.val = Number(v);
                } else {
                  s.type = "string";
                  s.val = v;
                }
              }
            });
          });
          allKeys.forEach((key) => {
            agg[key] = state[key].val;
          });
          return agg;
        })
        .sort((a, b) => a.Match - b.Match);
    }

    // Group raw rows by team
    const groups = {};
    teamViewData.forEach((row) => {
      if (row.RecordType === "Match_Event") return;
      const k = String(row.Team ?? row.team ?? "").replace(/\D/g, "");
      if (!k) return;
      if (!groups[k]) groups[k] = [];
      groups[k].push(row);
    });

    // Aggregate each team
    const cache = {};
    for (const [teamStr, rows] of Object.entries(groups)) {
      cache[teamStr] = aggregateMatches(rows);
    }
    teamAggCache = cache;

    // Build global stats from aggregated data
    const allAgg = Object.values(cache).flat();
    const allKeys = new Set();
    allAgg.forEach((row) =>
      Object.keys(row).forEach((k) => {
        if (!EXCLUDED_FIELDS.has(k)) allKeys.add(k);
      }),
    );

    const gs = {};
    allKeys.forEach((metric) => {
      if (BOOLEAN_METRICS.includes(metric) || metric === CLIMBSTATE_METRIC) {
        gs[metric] = { isNumeric: false };
        return;
      }
      const vals = allAgg
        .map((r) => r[metric])
        .filter(
          (v) =>
            v !== undefined &&
            v !== null &&
            v !== "" &&
            isNum(v) &&
            Number(v) !== -1,
        )
        .map(Number);
      if (!vals.length) {
        gs[metric] = { isNumeric: false };
        return;
      }
      const mu = mean(vals);
      gs[metric] = {
        isNumeric: true,
        mean: mu,
        sd: sd(vals, mu),
        p25: percentile(vals, 25),
        p50: percentile(vals, 50),
        p75: percentile(vals, 75),
      };
    });
    console.log(
      "[cache] globalStats keys:",
      Object.keys(gs).length,
      "teamAggCache teams:",
      Object.keys(cache).length,
    );
    hovercardGlobalStats = gs;
  }

  // Pre-fetch OPRs when eventCode is available so hovercard gets them instantly
  $effect(() => {
    if (eventCode) {
      fetchOPR(eventCode)
        .then(({ oprs }) => {
          cachedOPRs = oprs ?? {};
        })
        .catch(() => {});
    }
  });

  function showTeamDetails(team) {
    hoveredTeam = team;
    hoverVisible = true;
  }

  function closeTeamDetails() {
    hoverVisible = false;
  }

  function onDocumentClick(e) {
    if (!hoverVisible) return;
    const card = document.querySelector(".hover-card");
    if (card && card.contains(e.target)) return;
    hoverVisible = false;
  }

  // ---------------------------------- SUCCESS/UNSUCCESSFUL HOVERCARD PICKLIST COPYING ----------------------------------
  let notification = $state(null);

  function showNotification(message, type = "success", duration = 3000) {
      notification = { message, type };
      setTimeout(() => { notification = null; }, duration);
  }

  // ─── EFFECTS ─────────────────────────────────────────────────────────────────

  $effect(() => {
    if (hoverVisible) {
      document.addEventListener("mousedown", onDocumentClick);
      return () => document.removeEventListener("mousedown", onDocumentClick);
    }
  });

  $effect(() => {
    if (eventCode) {
      getTeams();
    }
  });

  $effect(() => {
    const selection = allianceSelections[activeAllianceSelectionId];
    if (selection) {
      alliances = selection.alliances;
      isFourTeamAlliance = selection.isFourTeamAlliance || false;
    }
  });

  $effect(() => {
    const selection = allianceSelections[activeAllianceSelectionId];
    if (selection) {
      selection.alliances = alliances;
      selection.isFourTeamAlliance = isFourTeamAlliance;
    }
  });

  $effect(() => {
    if (
      eventCode &&
      activeView === "alliances" &&
      alliances.every((a) => a.teams.length === 0)
    ) {
      populateAllianceCaptains();
    }
  });

  $effect(() => {
    if (!isFourTeamAlliance) {
      alliances.forEach((alliance) => {
        if (alliance.teams.length > 3) {
          alliance.teams.length = 3;
        }
      });
    }
  });

  // ─── HELPERS ─────────────────────────────────────────────────────────────────

  function makeEmptyAlliances() {
    return Array.from({ length: 8 }, (_, i) => ({ id: i + 1, teams: [] }));
  }

  function teamFromStore(teamNumber) {
    return {
      team_number: teamNumber,
      nickname: $teamsStore._teams.get(teamNumber),
    };
  }

  function getAvailableTeamNumbers() {
    return ($teamsStore._teamNumbers ?? []).filter((teamNumber) => {
      if (activeView !== "alliances") return true;
      return !alliances.some((a) =>
        a.teams.some((t) => t.team_number === teamNumber),
      );
    });
  }

  function pickTeamForAlliance(
    sortedTeams,
    pickingAlliance,
    pickingAllianceIndex,
  ) {
    const maxTeams = isFourTeamAlliance ? 4 : 3;
    if (pickingAlliance.teams.length >= maxTeams) return;

    const pickedNumbers = alliances
      .filter((a) => a.teams.length > 1)
      .flatMap((a) => a.teams.map((t) => t.team_number));

    const unpickableCaptains = alliances
      .slice(0, pickingAllianceIndex)
      .filter((a) => a.teams.length === 1)
      .map((a) => a.teams[0].team_number);

    const selfCaptain = pickingAlliance.teams[0]?.team_number;

    const teamToPick = sortedTeams.find(
      (t) =>
        !pickedNumbers.includes(t.team_number) &&
        !unpickableCaptains.includes(t.team_number) &&
        t.team_number !== selfCaptain,
    );

    if (!teamToPick) return;

    const originalAlliance = alliances.find(
      (a) =>
        a.teams.length === 1 &&
        a.teams[0].team_number === teamToPick.team_number,
    );

    pickingAlliance.teams.push(teamToPick);

    if (originalAlliance) {
      const vacantIndex = alliances.findIndex(
        (a) => a.id === originalAlliance.id,
      );
      if (vacantIndex === -1) return;

      for (let i = vacantIndex; i < 7; i++) {
        alliances[i].teams = alliances[i + 1].teams;
      }

      const occupiedKeys = new Set(
        alliances.flatMap((a) => a.teams.map((t) => t.team_number)),
      );
      const nextCaptainEntry = rankedTeams.find(
        (rt) => !occupiedKeys.has(rt.team_number),
      );

      alliances[7].teams = nextCaptainEntry
        ? [teamFromStore(nextCaptainEntry.team_number)]
        : [];
    }
  }

  // ─── DATA FETCHING ───────────────────────────────────────────────────────────

  async function getTeams() {
    if (!eventCode) {
      alert("Please select an event first.");
      return;
    }
    try {
      const [{ _teams, _teamNumbers }, teamRanksRaw] = await Promise.all([
        fetchTeams(eventCode),
        fetchTeamStatuses(eventCode),
      ]);

      const teamsMap = new Map(
        Object.entries(_teams).map(([k, v]) => [Number(k), v]),
      );
      const _teamRanks = new Map(
        Object.entries(teamRanksRaw).map(([k, v]) => [Number(k), v]),
      );

      _teamNumbers.sort((a, b) => {
        const rankA = _teamRanks.get(a);
        const rankB = _teamRanks.get(b);
        if (rankA != null && rankB != null) return rankA - rankB;
        if (rankA != null) return -1;
        if (rankB != null) return 1;
        return a - b;
      });

      teamsStore.set({ _teams: teamsMap, _teamNumbers, _teamRanks });
    } catch (err) {
      console.error(err);
      alert("Failed to fetch teams for this event.");
    }
  }

  async function populateAllianceCaptains() {
    if (!eventCode) {
      alert("Please select an event first.");
      return;
    }
    try {
      const _teamRanks = await fetchTeamStatuses(eventCode);

      rankedTeams = Object.entries(_teamRanks)
        .filter(([, rank]) => rank != null)
        .map(([team_number, rank]) => ({ team_number: parseInt(team_number), rank }))
        .sort((a, b) => a.rank - b.rank);

      if ($teamsStore._teamNumbers.length === 0) {
        await getTeams();
      }

      alliances = makeEmptyAlliances();

      rankedTeams.slice(0, 8).forEach(({ team_number, rank }) => {
        const team = teamFromStore(team_number);
        const allianceIndex = rank - 1;
        if (team.nickname && allianceIndex >= 0 && allianceIndex < 8) {
          alliances[allianceIndex].teams.push(team);
        }
      });

      // AFTER
    if (rankedTeams.length < 8) {
        showNotification("Not enough ranked teams to populate all 8 alliance captain spots.", "error");
    }
    } catch (err) {
      console.error(err);
      alert("Failed to populate alliance captains.");
    }
  }

  // ─── FILL FUNCTIONS ──────────────────────────────────────────────────────────

  async function rankFill() {
    createAndSwitchToNewAllianceSelection("Rank Filled");
    await populateAllianceCaptains();

    if (rankedTeams.length === 0) {
      alert(
        "Please ensure team rankings are loaded. The new selection may be empty.",
      );
      return;
    }

    const occupied = () =>
      new Set(alliances.flatMap((a) => a.teams.map((t) => t.team_number)));

    let available = rankedTeams.filter((rt) => !occupied().has(rt.team_number));

    const pickNext = (alliance) => {
      const maxTeams = isFourTeamAlliance ? 4 : 3;
      if (alliance.teams.length >= maxTeams || available.length === 0) return;
      const next = available.shift();
      const team = teamFromStore(next.team_number);
      if (team.nickname) alliance.teams.push(team);
    };

    for (let i = 7; i >= 0; i--) pickNext(alliances[i]);
    for (let i = 7; i >= 0; i--) pickNext(alliances[i]);
    if (isFourTeamAlliance) {
      for (let i = 7; i >= 0; i--) pickNext(alliances[i]);
    }
  }

  async function oprFill() {
    if (!eventCode) {
      alert("Please select an event first.");
      return;
    }

    createAndSwitchToNewAllianceSelection("OPR Filled");
    await populateAllianceCaptains();

    if (!alliances.every((a) => a.teams.length > 0)) {
      alert(
        "Could not populate all alliance captains. The new selection may be incomplete.",
      );
      return;
    }

    const { oprs } = await fetchOPR(eventCode);
    if (!oprs || Object.keys(oprs).length === 0) {
      alert("OPRs not available for this event.");
      return;
    }

    const oprSortedTeams = Object.entries(oprs)
      .sort(([, a], [, b]) => b - a)
      .map(([teamKey]) => teamFromStore(parseInt(teamKey.replace("frc", ""))))
      .filter((t) => t.nickname != null);

    for (let i = 0; i < 8; i++)
      pickTeamForAlliance(oprSortedTeams, alliances[i], i);
    for (let i = 7; i >= 0; i--)
      pickTeamForAlliance(oprSortedTeams, alliances[i], i);
    if (isFourTeamAlliance) {
      for (let i = 7; i >= 0; i--)
        pickTeamForAlliance(oprSortedTeams, alliances[i], i);
    }
  }

  async function epaFill() {
    if (!eventCode) {
      alert("Please select an event first.");
      return;
    }

    createAndSwitchToNewAllianceSelection("EPA Filled");
    await populateAllianceCaptains();

    if (!alliances.every((a) => a.teams.length > 0)) {
      alert(
        "Could not populate all alliance captains. The new selection may be incomplete.",
      );
      return;
    }

    const epas = await fetchEventEpas(eventCode);
    if (epas.length === 0) {
      alert("EPAs not available for this event.");
      return;
    }

    const epaSortedTeams = epas
      .sort((a, b) => b.epa.total_points.mean - a.epa.total_points.mean)
      .map((stat) => teamFromStore(stat.team))
      .filter((t) => t.nickname != null);

    for (let i = 0; i < 8; i++)
      pickTeamForAlliance(epaSortedTeams, alliances[i], i);
    for (let i = 7; i >= 0; i--)
      pickTeamForAlliance(epaSortedTeams, alliances[i], i);
    if (isFourTeamAlliance) {
      for (let i = 7; i >= 0; i--)
        pickTeamForAlliance(epaSortedTeams, alliances[i], i);
    }
  }

  // ─── PICKLIST MANAGEMENT ─────────────────────────────────────────────────────

  function createPickList() {
    const name = newPickListName.trim();
    if (!name) return;
    if (Object.values(picklists).some((p) => p.name === name)) {
      alert("Picklist with that name already exists.");
      return;
    }
    picklists[`picklist_${Date.now()}`] = { name, teams: [] };
    newPickListName = "";
  }

  function deletePickList(key) {
    delete picklists[key];
    picklists = { ...picklists };
  }

  function startEditing(id, currentName) {
    editingPicklistId = id;
    editingPicklistName = currentName;
  }

  function finishEditing(id) {
    if (editingPicklistId === null) return;
    const newName = editingPicklistName.trim();
    const originalName = picklists[id]?.name;
    if (newName !== originalName) {
      if (
        newName &&
        !Object.values(picklists).some((p) => p.name === newName)
      ) {
        picklists[id].name = newName;
      } else {
        alert("Picklist name cannot be empty or already exist.");
      }
    }
    editingPicklistId = null;
    editingPicklistName = "";
  }

  function toggleTeamPicked(teamNumber) {
    pickedTeams[teamNumber] = !pickedTeams[teamNumber];
  }

  async function createOprPicklist() {
    if (!eventCode) {
      alert("Please select an event first.");
      return;
    }

    const picklistName = "OPR Rank";
    if (Object.values(picklists).some((p) => p.name === picklistName)) {
      alert(`A picklist named "${picklistName}" already exists.`);
      return;
    }

    if ($teamsStore._teamNumbers.length === 0) await getTeams();

    const { oprs } = await fetchOPR(eventCode);
    if (!oprs || Object.keys(oprs).length === 0) {
      alert("OPRs not available for this event.");
      return;
    }

    const sortedTeams = Object.entries(oprs)
      .sort(([, a], [, b]) => b - a)
      .map(([teamKey]) => teamFromStore(parseInt(teamKey.replace("frc", ""))))
      .filter((t) => t.nickname != null);

    picklists[`picklist_${Date.now()}`] = {
      name: picklistName,
      teams: sortedTeams,
    };
  }

  async function createEpaPicklist() {
    if (!eventCode) {
      alert("Please select an event first.");
      return;
    }

    const picklistName = "EPA Rank";
    if (Object.values(picklists).some((p) => p.name === picklistName)) {
      alert(`A picklist named "${picklistName}" already exists.`);
      return;
    }

    if ($teamsStore._teamNumbers.length === 0) await getTeams();

    const eventData = await fetchEventEpas(eventCode);
    if (eventData.length === 0) {
      alert("EPA data not available for this event.");
      return;
    }

    const sortedTeams = eventData
      .sort((a, b) => b.epa.total_points.mean - a.epa.total_points.mean)
      .map((stat) => teamFromStore(stat.team))
      .filter((t) => t.nickname != null);

    picklists[`picklist_${Date.now()}`] = {
      name: picklistName,
      teams: sortedTeams,
    };
  }

  // ─── IMPORT / EXPORT ─────────────────────────────────────────────────────────

  async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
    } else {
        const el = document.createElement("textarea");
        el.value = text;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
    }
}
  
  async function copySinglePicklist(list) {
      const dataString = `${list.name}:${list.teams.map((t) => t.team_number).join(",")}`;
      try {
          await copyToClipboard(bs85.encode(pako.deflate(dataString)));
          showNotification("✓ Picklist copied to clipboard!");
      } catch (err) {
          console.error("Failed to copy text:", err);
          showNotification("Failed to copy picklist.", "error");
      }
  } 

  async function exportPicklists() {
      const dataString = Object.values(picklists)
          .map((list) => `${list.name}:${list.teams.map((t) => t.team_number).join(",")}`)
          .join(";");
      try {
          await copyToClipboard(bs85.encode(pako.deflate(dataString)));
          showNotification("✓ All picklists copied to clipboard!");
      } catch (err) {
          console.error("Failed to copy text:", err);
          showNotification("Failed to copy picklists.", "error");
      }
  }

  async function copyAllianceSelection() {
      const selection = allianceSelections[activeAllianceSelectionId];
      if (!selection) return;
      const dataString = [
          selection.name,
          selection.isFourTeamAlliance ? "1" : "0",
          selection.alliances.map((a) => a.teams.map((t) => t.team_number).join(",")).join(";"),
      ].join("|");
      try {
          await copyToClipboard(bs85.encode(pako.deflate(dataString)));
          showNotification("✓ Alliance selection copied to clipboard!");
      } catch (err) {
          console.error("Failed to copy:", err);
          showNotification("Failed to copy alliance selection.", "error");
      }
  }

  function importPicklists() {
    if (!importData) {
      alert("Please paste the data to import.");
      return;
    }
    try {
      const decompressed = pako.inflate(bs85.decode(importData), {
        to: "string",
      });
      const newPicklists = {};
      for (const listData of decompressed.split(";")) {
        if (!listData) continue;
        const [name, teamNumbersStr] = listData.split(":");
        if (!name) continue;
        const teamNumbers = teamNumbersStr ? teamNumbersStr.split(",") : [];
        const teams = teamNumbers
          .map((numStr) => {
            const num = parseInt(numStr);
            const team = teamFromStore(num);
            return team.nickname ? team : null;
          })
          .filter(Boolean);
        newPicklists[`picklist_${Date.now()}_${Math.random()}`] = {
          name,
          teams,
        };
      }
      picklists = newPicklists;
      importData = "";
    } catch (error) {
      alert("Failed to parse import data. Please check the format.");
      console.error("Import error:", error);
    }
  }

  // ─── DRAG & DROP ─────────────────────────────────────────────────────────────

  function handleDragStart(item, sourceList) {
    draggedItem = { item, sourceList };
  }

  function handleDragOver(event) {
    event.preventDefault();
  }

  function handleDragEnter(event, listKey) {
    if (!draggedItem) return;
    const { item, sourceList } = draggedItem;
    if (sourceList !== listKey) return;

    const list = picklists[listKey]?.teams;
    if (!list) return;

    const targetElement = event.target.closest("[data-team-number]");
    if (!targetElement) return;

    const targetNumber = Number(targetElement.dataset.teamNumber);
    if (!targetNumber) return;

    const draggedIndex = list.findIndex(t => t.team_number === item.team_number);
    const dropIndex = list.findIndex(t => t.team_number === targetNumber);

    if (draggedIndex !== -1 && dropIndex !== -1 && draggedIndex !== dropIndex) {
        const [moved] = list.splice(draggedIndex, 1);
        list.splice(dropIndex, 0, moved);
        picklists = { ...picklists }; // force reactivity
    }
}

  function handleDrop(targetListKey) {
    if (!draggedItem) return;
    const { item, sourceList } = draggedItem;

    if (sourceList === targetListKey) {
      draggedItem = null;
      return;
    }

    const target = picklists[targetListKey];
    if (
      target &&
      !target.teams.some((t) => t.team_number === item.team_number)
    ) {
      target.teams.push(item);
    }

    if (sourceList && sourceList !== "teams" && picklists[sourceList]) {
      const source = picklists[sourceList];
      const index = source.teams.findIndex(
        (t) => t.team_number === item.team_number,
      );
      if (index > -1) source.teams.splice(index, 1);
    }

    draggedItem = null;
  }

  function handleDropToRemove(event) {
    if (!draggedItem) return;
    // If dropped inside any picklist, do nothing (don't remove)
    if (event.target.closest(".picklist .list")) return;

    const { item, sourceList } = draggedItem;

    // Remove from picklist if that's the source
    if (sourceList && sourceList !== "teams" && picklists[sourceList]) {
      const source = picklists[sourceList];
      const index = source.teams.findIndex(
        (t) => t.team_number === item.team_number,
      );
      if (index > -1) {
        source.teams.splice(index, 1);
        picklists = { ...picklists };
      }
    } else if (sourceList?.startsWith("alliance_")) {
      const sourceAllianceId = parseInt(sourceList.split("_")[1]);
      const sourceAlliance = alliances.find((a) => a.id === sourceAllianceId);
      if (sourceAlliance) {
        const index = sourceAlliance.teams.findIndex(
          (t) => t.team_number === item.team_number,
        );
        if (index > -1) {
          sourceAlliance.teams.splice(index, 1);
          alliances = [...alliances];
          if (index === 0 && sourceAlliance.id <= 8) updateAllianceCaptains();
        }
      }
    }

    draggedItem = null;
  }

  function handleDropOnAlliance(targetAllianceId) {
    if (!draggedItem) return;
    const { item, sourceList } = draggedItem;
    const targetAlliance = alliances.find((a) => a.id === targetAllianceId);

    if (!targetAlliance) {
      draggedItem = null;
      return;
    }

    const maxTeams = isFourTeamAlliance ? 4 : 3;
    if (targetAlliance.teams.length >= maxTeams) {
      alert("This alliance is full.");
      draggedItem = null;
      return;
    }

    if (!targetAlliance.teams.some((t) => t.team_number === item.team_number)) {
      targetAlliance.teams.push(item);
    }

    if (sourceList?.startsWith("alliance_")) {
      const sourceAllianceId = parseInt(sourceList.split("_")[1]);
      if (sourceAllianceId !== targetAllianceId) {
        const sourceAlliance = alliances.find((a) => a.id === sourceAllianceId);
        if (sourceAlliance) {
          const index = sourceAlliance.teams.findIndex(
            (t) => t.team_number === item.team_number,
          );
          if (index > -1) {
            sourceAlliance.teams.splice(index, 1);
            if (index === 0 && sourceAlliance.id <= 8) updateAllianceCaptains();
          }
        }
      }
    }

    draggedItem = null;
  }

  // ─── ALLIANCE MANAGEMENT ─────────────────────────────────────────────────────

  async function updateAllianceCaptains() {
    if (rankedTeams.length === 0) return;
    const emptyIndex = alliances.findIndex(
      (a) => a.id <= 8 && a.teams.length === 0,
    );
    if (emptyIndex === -1) return;
    for (let i = emptyIndex; i < 7; i++)
      alliances[i].teams = alliances[i + 1].teams;
    const occupied = new Set(
      alliances.flatMap((a) => a.teams.map((t) => t.team_number)),
    );
    const next = rankedTeams.find((rt) => !occupied.has(rt.team_number));
    alliances[7].teams = next ? [teamFromStore(next.team_number)] : [];
  }

  function createAllianceSelection() {
    const name = newAllianceSelectionName.trim();
    if (!name) {
      alert("Please enter a name for the new alliance selection.");
      return;
    }
    if (Object.values(allianceSelections).some((s) => s.name === name)) {
      alert("An alliance selection with that name already exists.");
      return;
    }
    const newId = `selection_${Date.now()}`;
    allianceSelections[newId] = {
      name,
      alliances: makeEmptyAlliances(),
      isFourTeamAlliance: false,
    };
    activeAllianceSelectionId = newId;
    newAllianceSelectionName = "";
  }

  function createAndSwitchToNewAllianceSelection(name) {
    let newName = name;
    let counter = 1;
    while (Object.values(allianceSelections).some((s) => s.name === newName)) {
      newName = `${name} ${++counter}`;
    }
    const newId = `selection_${Date.now()}`;
    allianceSelections[newId] = {
      name: newName,
      alliances: makeEmptyAlliances(),
      isFourTeamAlliance,
    };
    activeAllianceSelectionId = newId;
  }

  function deleteAllianceSelection() {
    if (activeAllianceSelectionId === "default") {
      alert("You cannot delete the Default selection.");
      return;
    }
    if (Object.keys(allianceSelections).length <= 1) {
      alert("You cannot delete the last alliance selection.");
      return;
    }
    const name = allianceSelections[activeAllianceSelectionId]?.name;
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      delete allianceSelections[activeAllianceSelectionId];
      activeAllianceSelectionId = Object.keys(allianceSelections)[0];
    }
  }

  function startEditingAllianceSelection() {
    if (!activeAllianceSelectionId) return;
    editingAllianceSelectionId = activeAllianceSelectionId;
    editingAllianceSelectionName =
      allianceSelections[activeAllianceSelectionId].name;
  }

  function finishEditingAllianceSelection() {
    if (editingAllianceSelectionId === null) return;
    const newName = editingAllianceSelectionName.trim();
    const originalName = allianceSelections[editingAllianceSelectionId]?.name;
    if (newName !== originalName) {
      if (
        newName &&
        !Object.values(allianceSelections).some((s) => s.name === newName)
      ) {
        allianceSelections[editingAllianceSelectionId].name = newName;
      } else {
        alert("Alliance selection name cannot be empty or already exist.");
      }
    }
    editingAllianceSelectionId = null;
    editingAllianceSelectionName = "";
  }

  function pasteAllianceSelection() {
    if (!allianceImportData) {
      alert("Please paste the alliance selection data into the text box.");
      return;
    }
    try {
      const decompressed = pako.inflate(bs85.decode(allianceImportData), {
        to: "string",
      });
      const parts = decompressed.split("|");
      if (parts.length !== 3) throw new Error("Invalid data format");

      const [name, isFourTeamStr, alliancesStr] = parts;
      let newName = name;
      let counter = 1;
      while (
        Object.values(allianceSelections).some((s) => s.name === newName)
      ) {
        newName = `${name} (${++counter})`;
      }

      const allianceTeamStrs = alliancesStr.split(";");
      const newAlliances = Array.from({ length: 8 }, (_, i) => {
        const teams = (allianceTeamStrs[i] || "")
          .split(",")
          .filter(Boolean)
          .map((numStr) => {
            const team = teamFromStore(parseInt(numStr));
            return team.nickname ? team : null;
          })
          .filter(Boolean);
        return { id: i + 1, teams };
      });

      const newId = `selection_${Date.now()}`;
      allianceSelections[newId] = {
        name: newName,
        alliances: newAlliances,
        isFourTeamAlliance: isFourTeamStr === "1",
      };
      activeAllianceSelectionId = newId;
      allianceImportData = "";
    } catch (error) {
      alert(
        "Failed to parse alliance selection data. Please check the format.",
      );
      console.error("Alliance import error:", error);
    }
  }
</script>

<div class="page-wrapper">
  {#if notification}
    <div class="banner banner-{notification.type}" onclick={() => notification = null}>
        {notification.message}
    </div>
  {/if}

  <!-- Header -->
  <div class="header-section">
    <h1>Picklists & Alliance Selection</h1>
  </div>

  <!-- Top Controls -->
  <div class="top-controls">
    <div class="top-left-group">
      <div class="tabs">
        <button
          class:active={activeView === "picklists"}
          onclick={() => (activeView = "picklists")}
        >
          Picklists
        </button>
        <button
          class:active={activeView === "alliances"}
          onclick={() => (activeView = "alliances")}
        >
          Alliance Selection
        </button>
      </div>
    </div>
    <h3>
      Selected Event:
      {#if eventCode}
        <span>{eventCode}</span>
      {:else}
        <span style="opacity: 0.6;">(none)</span>
      {/if}
    </h3>
  </div>

  <!-- Main Content -->
  <div
    class="main-content"
    ondragover={handleDragOver}
    ondrop={(e) => {
      e.preventDefault();
      handleDropToRemove(e);
    }}
    role="application"
  >
    <!-- Team List Sidebar -->
    <div class="team-list-container">
      <h2>Teams</h2>
      <div class="team-list">
        <div
          class="list"
          role="application"
          ondragover={handleDragOver}
          ondrop={() => {}}
        >
          {#each getAvailableTeamNumbers() as teamNumber (teamNumber)}
            {@const team = teamFromStore(teamNumber)}
            <Team
              {team}
              picked={!!pickedTeams[teamNumber]}
              onclick={() => toggleTeamPicked(teamNumber)}
              ondragstart={() => handleDragStart(team, "teams")}
              onshowdetails={() => showTeamDetails(team)}
            />
          {/each}
        </div>
      </div>
    </div>

    <!-- Right Side View -->
    <div
      class="view-container"
      role="application"
      ondragover={handleDragOver}
      ondrop={(e) => {
        e.preventDefault();
        handleDropToRemove(e);
      }}
    >
      {#if activeView === "picklists"}
        <div class="picklist-view">
          <div style="margin-bottom: 20px;">
            <input
              type="text"
              bind:value={newPickListName}
              placeholder="New picklist name"
              onkeydown={(e) => e.key === "Enter" && createPickList()}
              style="width: 300px;"
            />
            <button onclick={createPickList}>Create Picklist</button>
          </div>

          <div class="container">
            {#each Object.entries(picklists) as [key, list]}
              <div class="picklist">
                <h2>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <button
                      onclick={() => copySinglePicklist(list)}
                      style="background: transparent; border: none; padding: 0; display: flex; align-items: center; color: white; opacity: 0.8; cursor: pointer;"
                      title="Copy to clipboard"
                      aria-label="Copy to clipboard"
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"
                        ></rect>
                        <path
                          d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                        ></path>
                      </svg>
                    </button>
                    {#if editingPicklistId === key}
                      <input
                        type="text"
                        bind:value={editingPicklistName}
                        onblur={() => finishEditing(key)}
                        onkeydown={(e) =>
                          e.key === "Enter" && finishEditing(key)}
                        onfocus={(e) => e.currentTarget.select()}
                      />
                    {:else}
                      <span
                        role="button"
                        tabindex="0"
                        onclick={() => startEditing(key, list.name)}
                        onkeydown={(e) =>
                          e.key === "Enter" && startEditing(key, list.name)}
                      >
                        {list.name}
                      </span>
                    {/if}
                  </div>
                  <button
                    onclick={() => deletePickList(key)}
                    style="background: transparent; border: none; font-size: 1.2rem; padding: 0;"
                    >X</button
                  >
                </h2>
                <div
                  class="list"
                  role="application"
                  ondragover={handleDragOver}
                  ondrop={() => handleDrop(key)}
                  ondragenter={(e) => handleDragEnter(e, key)}
                >
                  {#each list.teams as team (team.team_number)}
                    <Team
                      {team}
                      picked={!!pickedTeams[team.team_number]}
                      onclick={() => toggleTeamPicked(team.team_number)}
                      ondragstart={() => handleDragStart(team, key)}
                      onshowdetails={() => showTeamDetails(team)}
                    />
                  {/each}
                </div>
              </div>
            {/each}
          </div>

          <div class="share-container">
            <div class="share-controls">
              <h3>Share Picklists</h3>
              <p style="margin: 5px 0 10px; font-size: 0.9em; opacity: 0.8;">
                Generate a code to share your current picklists with others.
              </p>
              <button onclick={exportPicklists}>Copy Code to Clipboard</button>
            </div>
            <div class="share-controls">
              <h3>Import Picklists</h3>
              <textarea
                bind:value={importData}
                rows="4"
                placeholder="Paste shared data string here..."
              ></textarea>
              <br />
              <button onclick={importPicklists}>Import Data</button>
            </div>
          </div>

          <div class="fixed-buttons">
            <button onclick={createOprPicklist}>Create OPR Picklist</button>
            <button onclick={createEpaPicklist}>Create EPA Picklist</button>
          </div>
        </div>
      {/if}

      {#if activeView === "alliances"}
        <div class="alliance-selection">
          <div class="alliance-with-picklists">
            <div class="alliance-main">
              <div class="alliance-controls">
                <h2>Alliance Selection Board</h2>
                <div style="display: flex; gap: 20px; align-items: center;">
                  <label
                    style="display: flex; align-items: center; gap: 10px; cursor: pointer;"
                  >
                    <input
                      type="checkbox"
                      bind:checked={isFourTeamAlliance}
                      style="width: 20px; height: 20px;"
                    />
                    4 teams per alliance
                  </label>
                  <button onclick={populateAllianceCaptains}>Reset Board</button
                  >
                </div>
              </div>

              <div class="alliances-container">
                {#each alliances as alliance}
                  <div
                    class="alliance-list"
                    role="application"
                    ondragover={handleDragOver}
                    ondrop={() => handleDropOnAlliance(alliance.id)}
                  >
                    <h3>Alliance {alliance.id}</h3>
                    <div
                      class="list"
                      role="application"
                      ondragover={handleDragOver}
                      ondrop={() => handleDropOnAlliance(alliance.id)}
                    >
                      {#each alliance.teams as team (team.team_number)}
                        <Team
                          {team}
                          picked={!!pickedTeams[team.team_number]}
                          onclick={() => toggleTeamPicked(team.team_number)}
                          ondragstart={() =>
                            handleDragStart(team, `alliance_${alliance.id}`)}
                          onshowdetails={() => showTeamDetails(team)}
                        />
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>

              <div class="fixed-buttons">
                <button onclick={rankFill}>Fill by Rank</button>
                <button onclick={oprFill}>Fill by OPR</button>
                <button onclick={epaFill}>Fill by EPA</button>
              </div>
            </div>

            <div class="picklists-sidebar">
              <h2>Picklists</h2>
              <div class="picklists-scroll">
                {#if Object.keys(picklists).length === 0}
                  <p style="padding: 20px; text-align: center; opacity: 0.6;">
                    No picklists created yet
                  </p>
                {:else}
                  {#each Object.entries(picklists) as [key, list]}
                    <div class="sidebar-picklist">
                      <h3>{list.name}</h3>
                      <div class="sidebar-list">
                        {#each list.teams as team (team.team_number)}
                          <div
                            role="button"
                            tabindex="0"
                            class="sidebar-team"
                            class:picked={!!pickedTeams[team.team_number]}
                            draggable="true"
                            ondragstart={() => handleDragStart(team, key)}
                            onclick={(e) => {
                              e.stopPropagation();
                              showTeamDetails(team);
                            }}
                            onkeydown={(e) =>
                              e.key === "Enter" &&
                              showTeamDetails(team)}
                          >
                            {team.team_number}
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>

  {#if activeView === "alliances"}
    <div class="bottom-bar">
      <div class="alliance-management">
        <div class="current-selection-display">
          {#if editingAllianceSelectionId === activeAllianceSelectionId}
            <input
              type="text"
              bind:value={editingAllianceSelectionName}
              onblur={finishEditingAllianceSelection}
              onkeydown={(e) =>
                e.key === "Enter" && finishEditingAllianceSelection()}
              onfocus={(e) => e.currentTarget.select()}
            />
          {:else}
            <span
              role="button"
              tabindex="0"
              onclick={startEditingAllianceSelection}
              onkeydown={(e) =>
                e.key === "Enter" && startEditingAllianceSelection()}
              title="Click to rename"
            >
              {allianceSelections[activeAllianceSelectionId]?.name ||
                "Select a selection"}
            </span>
          {/if}
        </div>

        <select
          id="alliance-selection-switcher"
          bind:value={activeAllianceSelectionId}
          style="background: #333; border: 1px solid #555;"
        >
          {#each Object.entries(allianceSelections) as [id, selection]}
            <option value={id}>{selection.name}</option>
          {/each}
        </select>

        <button
          onclick={deleteAllianceSelection}
          disabled={Object.keys(allianceSelections).length <= 1 ||
            activeAllianceSelectionId === "default"}>Delete</button
        >

        <div
          style="width: 1px; height: 20px; background: #555; margin: 0 5px;"
        ></div>

        <button onclick={copyAllianceSelection}>Copy</button>
        <input
          type="text"
          bind:value={allianceImportData}
          placeholder="Paste data..."
          style="width: 150px;"
        />
        <button onclick={pasteAllianceSelection}>Paste</button>

        <div
          style="width: 1px; height: 20px; background: #555; margin: 0 5px;"
        ></div>

        <input
          type="text"
          bind:value={newAllianceSelectionName}
          placeholder="New list name"
          onkeydown={(e) => e.key === "Enter" && createAllianceSelection()}
          style="width: 150px;"
        />
        <button onclick={createAllianceSelection}>New</button>
      </div>
    </div>
  {/if}

  <!-- TeamHoverCard -->
  <TeamHoverCard
    team={hoveredTeam}
    {eventCode}
    bind:anchorEl={hoverAnchorEl}
    bind:visible={hoverVisible}
    {teamAggCache}
    globalStats={hovercardGlobalStats}
    {cachedOPRs}
    {cachedRobotPics}
  />
</div>

<style>
  :root {
    --frc-190-red: #c81b00;
    --wpi-gray: #a9b0b7;
    --frc-190-black: #4d4d4d;
    --dark-bg: #1a1a1a;
    --card-bg: #2d2d2d;
  }

  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    background: var(--wpi-gray);
  }

  :global(*) {
    box-sizing: border-box;
  }

  button {
    cursor: pointer;
    padding: 8px 16px;
    border: 2px solid var(--frc-190-red);
    background: linear-gradient(135deg, #333 0%, #444 100%);
    color: white;
    font-weight: 600;
    border-radius: 6px;
    transition: all 0.2s;
  }
  button:hover {
    background: linear-gradient(135deg, #444 0%, #555 100%);
    border-color: #e02200;
    transform: translateY(-1px);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
  }
  button:active {
    transform: translateY(0);
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  input[type="text"],
  textarea,
  select {
    padding: 8px 12px;
    border: 2px solid var(--frc-190-red);
    background: #333;
    color: white;
    border-radius: 6px;
    font-size: 14px;
  }
  input[type="text"]:focus,
  textarea:focus,
  select:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(200, 27, 0, 0.4);
  }

  .page-wrapper {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    padding-bottom: 80px;
    background: var(--wpi-gray);
  }

  .header-section {
    text-align: center;
    padding: 10px 0;
    margin-bottom: 10px;
  }
  .header-section h1 {
    color: var(--frc-190-red);
    font-size: 2.5rem;
    font-weight: 800;
    margin: 0 0 5px 0;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
    letter-spacing: 1px;
  }

  .top-controls {
    width: 100%;
    background: var(--dark-bg);
    padding: 10px 15px;
    border-top: 2px solid var(--frc-190-red);
    border-bottom: 2px solid var(--frc-190-red);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    margin-bottom: 5px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    color: white;
  }
  .top-left-group {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .tabs {
    display: flex;
    border: 2px solid var(--frc-190-red);
    border-radius: 6px;
    overflow: hidden;
  }
  .tabs button {
    border-radius: 0;
    border: none;
    background: #222;
    color: #aaa;
    padding: 10px 20px;
    font-size: 16px;
  }
  .tabs button:hover {
    background: #333;
    color: white;
    transform: none;
    box-shadow: none;
  }
  .tabs button.active {
    background: var(--frc-190-red);
    color: white;
    font-weight: bold;
  }

  .main-content {
    display: flex;
    width: 100%;
    gap: 5px;
    align-items: flex-start;
  }

  .team-list-container {
    width: 280px;
    background: var(--dark-bg);
    border: 2px solid var(--frc-190-black);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    height: calc(100vh - 120px);
    position: sticky;
    top: 20px;
    align-self: flex-start;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  }
  .team-list-container h2 {
    background: var(--frc-190-red);
    color: white;
    margin: 0;
    padding: 10px;
    text-align: center;
    font-size: 1.2rem;
    flex-shrink: 0;
  }
  .team-list {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
    min-height: 0;
  }

  .view-container {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
  .picklist-view {
    height: 75vh;
    overflow-y: auto;
    padding-right: 10px;
    padding-bottom: 20px;
  }

  .container {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 20px;
    margin-top: 20px;
  }

  .picklist,
  .alliance-list {
    background: var(--dark-bg);
    border: 2px solid var(--frc-190-black);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    min-height: 400px;
    overflow: hidden;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }
  .picklist h2,
  .alliance-list h3 {
    background: var(--frc-190-red);
    color: white;
    margin: 0;
    padding: 10px;
    font-size: 1.1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .picklist h2 input {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: white;
    width: 70%;
  }
  .picklist .list,
  .alliance-list .list {
    flex: 1;
    padding: 10px;
    background: #252525;
  }

  .share-container {
    margin-top: 30px;
    background: var(--dark-bg);
    padding: 20px;
    border-radius: 8px;
    border: 2px solid var(--frc-190-red);
    display: flex;
    gap: 20px;
    color: white;
  }
  .share-controls {
    flex: 1;
  }
  .share-controls h3 {
    margin-top: 0;
    color: var(--frc-190-red);
  }

  .fixed-buttons {
    position: fixed;
    bottom: 100px;
    right: 30px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    z-index: 50;
  }
  .fixed-buttons button {
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
  }

  .alliance-with-picklists {
    display: flex;
    gap: 5px;
  }
  .alliance-main {
    flex: 1;
    min-width: 0;
  }

  .alliance-controls {
    background: var(--dark-bg);
    padding: 15px;
    border-radius: 8px;
    border: 2px solid var(--frc-190-black);
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: white;
  }

  .alliances-container {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    max-width: 100%;
  }
  @media (max-width: 1600px) {
    .alliances-container {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .picklists-sidebar {
    width: 140px;
    background: var(--dark-bg);
    border: 2px solid var(--frc-190-black);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    height: calc(100vh - 120px);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
    position: sticky;
    top: 20px;
    align-self: flex-start;
  }
  .picklists-sidebar h2 {
    background: var(--frc-190-red);
    color: white;
    margin: 0;
    padding: 10px;
    text-align: center;
    font-size: 1.2rem;
    flex-shrink: 0;
  }
  .picklists-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
    min-height: 0;
  }

  .sidebar-picklist {
    background: #252525;
    border: 1px solid #333;
    border-radius: 6px;
    margin-bottom: 15px;
    overflow: hidden;
  }
  .sidebar-picklist h3 {
    background: #2d2d2d;
    color: var(--frc-190-red);
    margin: 0;
    padding: 8px 12px;
    font-size: 1rem;
    border-bottom: 1px solid #333;
  }
  .sidebar-list {
    padding: 5px;
  }
  .sidebar-team {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 3px;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 4px;
    margin-bottom: 2px;
    color: white;
    cursor: grab;
    transition: all 0.15s;
    font-size: 0.8rem;
    font-weight: bold;
  }
  .sidebar-team.picked {
    background: var(--frc-190-red);
    border-color: var(--frc-190-red);
  }
  .sidebar-team:hover {
    background: #222;
    border-color: var(--frc-190-red);
    transform: translateX(2px);
  }
  .sidebar-team:active {
    cursor: grabbing;
  }

  .bottom-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    background: #151515;
    border-top: 2px solid var(--frc-190-red);
    padding: 15px 30px;
    z-index: 100;
    display: flex;
    justify-content: center;
    box-shadow: 0 -4px 10px rgba(0, 0, 0, 0.3);
  }
  .alliance-management {
    background: #222;
    padding: 10px 20px;
    border-radius: 50px;
    display: flex;
    align-items: center;
    gap: 15px;
    border: 1px solid #444;
  }
  .alliance-management input {
    border-radius: 20px;
  }
  .current-selection-display {
    color: var(--frc-190-red);
    font-weight: bold;
    font-size: 1.1rem;
  }

  :global(::-webkit-scrollbar) {
    width: 10px;
    height: 10px;
  }
  :global(::-webkit-scrollbar-track) {
    background: #222;
  }
  :global(::-webkit-scrollbar-thumb) {
    background: var(--frc-190-red);
    border-radius: 5px;
    border: 2px solid #222;
  }
  :global(::-webkit-scrollbar-thumb:hover) {
    background: #e02200;
  }

  .banner {
    position: fixed;
    top: 40%;
    left: 50%;
    transform: translateX(-50%);
    padding: 1rem 2rem;
    border-radius: 8px;
    color: white;
    font-weight: bold;
    z-index: 10000;
    cursor: pointer;
}

  .banner-success {
      background-color: #4CAF50;
  }

  .banner-error {
      background-color: #f44336;
  }

</style>
