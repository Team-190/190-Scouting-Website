<script>
    import baseX from 'base-x';
    import pako from 'pako';
    import Team from '../../components/Team.svelte';
    import { selectedEvent as selectedEventStore } from '../../stores/selectedEvent';
    import { onDestroy } from 'svelte';
    import { writable } from 'svelte/store';
    import { AgCheckbox } from 'ag-grid-community';

    const BASE85_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~';
    const bs85 = baseX(BASE85_CHARS);

    export const teamsStore = writable([]);
    let tbaApiKey = $state('zhTqFG7csJoif1sNXt3aZngy0LB1X4LxMgTfXBvPscNG0P9FifZCa2uGJcUk2gKW');

    let picklists = $state({});
    let cachedPicklists = null;

    const sessionData = sessionStorage.getItem('picklists');
    if (sessionData) {
        try {
            cachedPicklists = JSON.parse(sessionData);
        } catch (e) {
            console.error('Failed to parse session picklists.')
        }
    }
    
    if (!cachedPicklists) {
    const localData = localStorage.getItem('picklists');
    if (localData) {
      try {
        cachedPicklists = JSON.parse(localData);
      } catch (e) {
        console.error('Failed to parse local picklists', e);
      }
    }
  }
    if (cachedPicklists) picklists = cachedPicklists;

    $effect(() => {
        try {
            sessionStorage.setItem('picklists', JSON.stringify(picklists));
            localStorage.setItem('picklists', JSON.stringify(picklists));
        } catch (e) {
            console.error('Failed to save picklists', e);
        }
    });

    let teams = $state([]);
    let draggedItem = $state(null);
    let newPickListName = $state('');
    let pickedTeams = $state({});
    let importData = $state('');
    let editingPicklistId = $state(null);
    let editingPicklistName = $state('');
    let alliances = $state(Array.from({ length: 8 }, (_, i) => ({ id: i + 1, teams: [] })));
    let activeView = $state('picklists');
    let rankedTeams = $state([]);
    let isFourTeamAlliance = $state(false);
    let loadingTeams = false;
    let teamsError = '';

    let cachedAllianceSelections = null;

    const sessionAllianceData = sessionStorage.getItem('allianceSelections');
    if (sessionAllianceData) {
        try {
            cachedAllianceSelections = JSON.parse(sessionAllianceData);
        } catch (e) {
            console.error('Failed to parse session allianceSelections.');
        }
    }

    if (!cachedAllianceSelections) {
        const localAllianceData = localStorage.getItem('allianceSelections');
        if (localAllianceData) {
            try {
                cachedAllianceSelections = JSON.parse(localAllianceData);
            } catch (e) {
                console.error('Failed to parse local allianceSelections', e);
            }
        }
    }

    let allianceSelections = $state(cachedAllianceSelections || {
        default: {
            name: 'Default',
            alliances: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, teams: [] }))
        }
    });

    $effect(() => {
        try {
            sessionStorage.setItem('allianceSelections', JSON.stringify(allianceSelections));
            localStorage.setItem('allianceSelections', JSON.stringify(allianceSelections));
        } catch (e) {
            console.error('Failed to save allianceSelections', e);
        }
    });

    let activeAllianceSelectionId = $state('default');
    let newAllianceSelectionName = $state('');
    let editingAllianceSelectionId = $state(null);
    let editingAllianceSelectionName = $state('');
    let allianceImportData = $state('');

    let selectedEvent = '';

    const unsubscribe = selectedEventStore.subscribe(value => {
        selectedEvent = value;
    });

    onDestroy(unsubscribe);

    $effect(() => {
        if (selectedEvent) {
            getTeams();
        } else {
            teams = [];
        }
    });


    $effect(() => {
        if (allianceSelections[activeAllianceSelectionId]) {
            alliances = allianceSelections[activeAllianceSelectionId].alliances;
            isFourTeamAlliance = allianceSelections[activeAllianceSelectionId].isFourTeamAlliance || false;
        }
    });

    $effect(() => {
        if (allianceSelections[activeAllianceSelectionId]) {
            allianceSelections[activeAllianceSelectionId].alliances = alliances;
            allianceSelections[activeAllianceSelectionId].isFourTeamAlliance = isFourTeamAlliance;
        }
    });

    async function exportPicklists() {
        const dataString = Object.values(picklists)
            .map(list => `${list.name}:${list.teams.map(t => t.team_number).join(',')}`)
            .join(';');
        
        const compressedData = pako.deflate(dataString);
        const encodedData = bs85.encode(compressedData);
        try {
            await navigator.clipboard.writeText(encodedData);
        } catch (err) {
            console.error('Failed to copy text: ', err);
            alert('Failed to copy picklists.');
        }
    }

    async function fetchTeamsForEvent(key) {
        if (!key) return;

        loadingTeams = true;
        teamsError = '';

        try {
            const res = await fetch(
                `https://www.thebluealliance.com/api/v3/event/${key}/teams/simple`,
                {
                    headers: {
                        'X-TBA-Auth-Key': tbaApiKey
                    }
                }
            );

            if (!res.ok) {
                throw new Error(`TBA error ${res.status}`);
            }

            teams = await res.json();
        } catch (err) {
            console.error(err);
            teamsError = 'Failed to load teams.';
            teams = [];
        } finally {
            loadingTeams = false;
        }
    }

    function importPicklists() {
        if (!importData) {
            alert('Please paste the data to import.');
            return;
        }
        try {
            const decodedBuffer = bs85.decode(importData);
            const decompressedData = pako.inflate(decodedBuffer, { to: 'string' });
            
            const newPicklists = {};
            const importedLists = decompressedData.split(';');
            
            const allTeamNumbers = new Set(teams.map(t => t.team_number.toString()));

            for (const listData of importedLists) {
                if (!listData) continue;
                const [name, teamNumbersStr] = listData.split(':');
                if (!name) continue;

                const teamNumbers = teamNumbersStr ? teamNumbersStr.split(',') : [];
                const newTeams = teamNumbers
                    .map(numStr => {
                        if (allTeamNumbers.has(numStr)) {
                            return teams.find(t => t.team_number.toString() === numStr);
                        }
                        return null;
                    })
                    .filter(Boolean); // Filter out any nulls if a team wasn't found

                const newId = `picklist_${Date.now()}_${Math.random()}`;
                newPicklists[newId] = { name, teams: newTeams };
                picklists = newPicklists;
            }

            importData = '';
        } catch (error) {
            alert('Failed to parse import data. Please check the format.');
            console.error('Import error:', error);
        }
    }

    function toggleTeamPicked(teamNumber) {
        pickedTeams[teamNumber] = !pickedTeams[teamNumber];
    }

    function createPickList() {
        if (newPickListName && !Object.values(picklists).some(p => p.name === newPickListName)) {
            const newId = `picklist_${Date.now()}`;
            picklists[newId] = { name: newPickListName, teams: [] };
            newPickListName = '';
        } else if (Object.values(picklists).some(p => p.name === newPickListName)) {
            alert('Picklist with that name already exists.');
        }
    }

    function startEditing(id, currentName) {
        editingPicklistId = id;
        editingPicklistName = currentName;
    }

    function finishEditing(id) {
        if (editingPicklistId === null) return;

        const originalName = Object.entries(picklists).find(([pId]) => pId === id)?.[1].name;
        const newName = editingPicklistName.trim();

        // If name is unchanged, do nothing.
        if (newName === originalName) {
            editingPicklistId = null;
            editingPicklistName = '';
            return;
        }

        // If name is changed, validate it.
        if (newName && !Object.values(picklists).some(p => p.name === newName)) {
            picklists[id].name = newName;
        } else {
            alert('Picklist name cannot be empty or already exist.');
        }
        editingPicklistId = null;
        editingPicklistName = '';
    }

    function deletePickList(key) {
        delete picklists[key];
    }

    async function getTeams() {
    if (!selectedEvent) {
        alert('Please select an event first.');
        return;
    }

    try {
        console.log('Fetching teams for:', selectedEvent);
        const teamPromise = fetch(`https://www.thebluealliance.com/api/v3/event/${selectedEvent}/teams/simple`, {
            headers: { 'X-TBA-Auth-Key': tbaApiKey }
        }).then(res => res.json());

        const statusesPromise = fetch(`https://www.thebluealliance.com/api/v3/event/${selectedEvent}/teams/statuses`, {
            headers: { 'X-TBA-Auth-Key': tbaApiKey }
        }).then(res => res.ok ? res.json() : null);

        const [teamList, statuses] = await Promise.all([teamPromise, statusesPromise]);

        if (statuses) {
            const teamRanks = Object.fromEntries(
                Object.entries(statuses)
                    .filter(([, status]) => status?.qual?.ranking?.rank != null)
                    .map(([teamKey, status]) => [teamKey.replace('frc', ''), status.qual.ranking.rank])
            );

            teamList.sort((a, b) => {
                const rankA = teamRanks[a.team_number];
                const rankB = teamRanks[b.team_number];
                if (rankA != null && rankB != null) return rankA - rankB;
                if (rankA != null) return -1;
                if (rankB != null) return 1;
                return a.team_number - b.team_number;
            });
        }

        teamsStore.set(teamList);
        teams = teamList;
    } catch (err) {
        console.error(err);
        alert('Failed to fetch teams for this event.');
    }
}

    function handleDragStart(item, sourceList) {
        draggedItem = { item, sourceList };
    }

    function handleDrop(targetListKey) {
        if (draggedItem) {
            const { item, sourceList } = draggedItem;

            // Reordering within the same list
            if (sourceList === targetListKey) {
                draggedItem = null; // Drag is done
                return; // Do nothing, reordering is handled by dragenter
            }

            // Add to target list, avoiding duplicates
            const target = picklists[targetListKey];
            if (target && !target.teams.some(t => t.team_number === item.team_number)) {
                target.teams.push(item);
            }

            // Remove from source if it's a picklist
            if (sourceList && sourceList !== 'teams') {
                const source = picklists[sourceList];
                if (source) {
                    const index = source.teams.findIndex(t => t.team_number === item.team_number);
                    if (index > -1) {
                        source.teams.splice(index, 1);
                    }
                }
            }
            // Note: we don't remove from the main 'teams' list to allow adding to multiple picklists

            draggedItem = null;
        }
    }

    function handleDropToRemove(event) {
        if (!draggedItem) return;

        // If the drop target is inside a picklist or alliance drop zone, let those handlers deal with it
        if (event.target.closest('.picklist .list') || event.target.closest('.alliance-list .list')) {
            return;
        }

        const { item, sourceList } = draggedItem;

        // Remove from a picklist
        if (sourceList && sourceList !== 'teams' && picklists[sourceList]) {
            const source = picklists[sourceList];
            const index = source.teams.findIndex(t => t.team_number === item.team_number);
            if (index > -1) {
                source.teams.splice(index, 1);
                picklists = { ...picklists };
            }
        }
        // Remove from an alliance
        else if (sourceList && sourceList.startsWith('alliance_')) {
            const sourceAllianceId = parseInt(sourceList.split('_')[1]);
            const sourceAlliance = alliances.find(a => a.id === sourceAllianceId);
            if (sourceAlliance) {
                const index = sourceAlliance.teams.findIndex(t => t.team_number === item.team_number);
                if (index > -1) {
                    sourceAlliance.teams.splice(index, 1);
                    alliances = [...alliances];
                    if (index === 0 && sourceAlliance.id <= 8) {
                        updateAllianceCaptains();
                    }
                }
            }
        }

        draggedItem = null;
    }

    function handleDropOnAlliance(targetAllianceId) {
        if (draggedItem) {
            const { item, sourceList } = draggedItem;

            const targetAlliance = alliances.find(a => a.id === targetAllianceId);

            if (targetAlliance) {
                const maxTeams = isFourTeamAlliance ? 4 : 3;
                // Check if alliance is full
                if (targetAlliance.teams.length >= maxTeams) {
                    alert('This alliance is full.');
                    draggedItem = null;
                    return;
                }

                // Add to target alliance, avoiding duplicates
                if (!targetAlliance.teams.some(t => t.team_number === item.team_number)) {
                    targetAlliance.teams.push(item);
                }

                // Remove from source if it's another alliance
                if (sourceList.startsWith('alliance_')) {
                    const sourceAllianceId = parseInt(sourceList.split('_')[1]);
                    if (sourceAllianceId !== targetAllianceId) {
                        const sourceAlliance = alliances.find(a => a.id === sourceAllianceId);
                        if (sourceAlliance) {
                            const index = sourceAlliance.teams.findIndex(t => t.team_number === item.team_number);
                            if (index > -1) {
                                sourceAlliance.teams.splice(index, 1);
                                // If a captain was moved, update the alliance captains
                                if (index === 0 && sourceAlliance.id <= 8) {
                                    updateAllianceCaptains();
                                }
                            }
                        }
                    }
                }
            }
            draggedItem = null;
        }
    }

    async function rankFill() {
        createAndSwitchToNewAllianceSelection('Rank Filled');
        await populateAllianceCaptains();

        if (rankedTeams.length === 0) {
            alert('Please ensure team rankings are loaded. The new selection may be empty.');
            return;
        }

        // --- Standard Serpentine Draft for remaining picks ---
        const teamsInAlliances = () => alliances.flatMap(a => a.teams.map(t => `frc${t.team_number}`));
        let availableRankedTeams = rankedTeams.filter(rt => !teamsInAlliances().includes(rt.team_key));

        const pickTeamForAlliance = (alliance) => {
            const maxTeams = isFourTeamAlliance ? 4 : 3;
            if (alliance.teams.length >= maxTeams) return; // Alliance is full

            if (availableRankedTeams.length > 0) {
                const teamToPickKey = availableRankedTeams.shift().team_key;
                const teamNumber = teamToPickKey.replace('frc', '');
                const team = teams.find(t => t.team_number == teamNumber);
                if (team) {
                    alliance.teams.push(team);
                }
            }
        };

        // Fill the rest of the second picks (8 -> 1)
        for (let i = 7; i >= 0; i--) {
            pickTeamForAlliance(alliances[i]);
        }

        // Fill third picks (8 -> 1)
        for (let i = 7; i >= 0; i--) {
            pickTeamForAlliance(alliances[i]);
        }

        // Fill fourth picks if enabled (8 -> 1)
        if (isFourTeamAlliance) {
            for (let i = 7; i >= 0; i--) {
                pickTeamForAlliance(alliances[i]);
            }
        }
    }

    async function oprFill() {
        if (!selectedEvent) {
            alert('Please select an event first.');
            return;
        }
        
        createAndSwitchToNewAllianceSelection('OPR Filled');
        await populateAllianceCaptains();

        const areCaptainsSet = alliances.every(a => a.teams.length > 0);
        if (!areCaptainsSet) {
            alert('Could not populate all alliance captains. The new selection may be incomplete.');
            return;
        }

        const response = await fetch(`https://www.thebluealliance.com/api/v3/event/${selectedEvent}/oprs`, {
            headers: { 'X-TBA-Auth-Key': tbaApiKey }
        });

        if (!response.ok) {
            alert('Could not fetch OPRs for this event. They may not be available.');
            return;
        }

        const oprs = await response.json();
        if (!oprs || !oprs.oprs) {
            alert('OPRs not available for this event.');
            return;
        }

        const sortedTeamNumbers = Object.keys(oprs.oprs).sort((a, b) => oprs.oprs[b] - oprs.oprs[a]);
        
        const oprSortedTeams = sortedTeamNumbers.map(teamNumber => {
            const teamKey = teamNumber.replace('frc', '');
            return teams.find(t => t.team_number == teamKey);
        }).filter(Boolean);

        const pickTeamForAlliance = (pickingAlliance, pickingAllianceIndex) => {
            const maxTeams = isFourTeamAlliance ? 4 : 3;
            if (pickingAlliance.teams.length >= maxTeams) return;

            // Get a list of teams that are already on a "full" alliance (2+ members)
            const pickedTeams = alliances
                .filter(a => a.teams.length > 1)
                .flatMap(a => a.teams.map(t => t.team_number));

            // Captains of alliances ranked higher than the current picker are unpickable.
            const unpickableCaptains = alliances
                .slice(0, pickingAllianceIndex)
                .filter(a => a.teams.length === 1)
                .map(a => a.teams[0].team_number);
            
            // The picking alliance cannot pick itself.
            const selfCaptain = pickingAlliance.teams[0].team_number;

            // Find the highest OPR team that is not already picked, not an unpickable captain, and not the picker themselves.
            const teamToPick = oprSortedTeams.find(t => 
                !pickedTeams.includes(t.team_number) &&
                !unpickableCaptains.includes(t.team_number) &&
                t.team_number !== selfCaptain
            );

            if (teamToPick) {
                // Find which alliance this team is currently captain of, if any
                const originalAlliance = alliances.find(a => a.teams.length === 1 && a.teams[0].team_number === teamToPick.team_number);

                // Add the picked team to the picking alliance
                pickingAlliance.teams.push(teamToPick);

                if (originalAlliance) {
                    // The captain was picked. We need to shift all subsequent captains up.
                    const vacantAllianceIndex = alliances.findIndex(a => a.id === originalAlliance.id);

                    if (vacantAllianceIndex !== -1) {
                        // Shift captains up from the vacant spot to the end
                        for (let i = vacantAllianceIndex; i < 7; i++) {
                            alliances[i].teams = alliances[i + 1].teams;
                        }

                        // Now, backfill the last alliance spot with the next highest ranked available team.
                        const allTeamsInAlliancesNow = alliances.flatMap(a => a.teams.map(t => `frc${t.team_number}`));
                        const nextCaptain = rankedTeams.find(rt => !allTeamsInAlliancesNow.includes(rt.team_key));

                        if (nextCaptain) {
                            const teamNumber = nextCaptain.team_key.replace('frc', '');
                            const team = teams.find(t => t.team_number == teamNumber);
                            if (team) {
                                alliances[7].teams = [team]; // Place new captain in the last alliance
                            } else {
                                alliances[7].teams = []; // Should not happen if teams list is correct
                            }
                        } else {
                            // No more available teams, the last alliance becomes empty
                            alliances[7].teams = [];
                        }
                    }
                }
            }
        };

        // Round 2 of picks (serpentine draft: 1->8)
        for (let i = 0; i < 8; i++) {
            pickTeamForAlliance(alliances[i], i);
        }

        // Round 3 of picks (serpentine draft: 8->1)
        for (let i = 7; i >= 0; i--) {
            pickTeamForAlliance(alliances[i], i);
        }

        // Round 4 (if 4-team alliances are enabled: 8->1)
        if (isFourTeamAlliance) {
            for (let i = 7; i >= 0; i--) {
                pickTeamForAlliance(alliances[i], i);
            }
        }
    }

    async function epaFill() {
        if (!selectedEvent) {
            alert('Please select an event first.');
            return;
        }

        createAndSwitchToNewAllianceSelection('EPA Filled');
        await populateAllianceCaptains();

        const areCaptainsSet = alliances.every(a => a.teams.length > 0);
        if (!areCaptainsSet) {
            alert('Could not populate all alliance captains. The new selection may be incomplete.');
            return;
        }

        const response = await fetch(`https://api.statbotics.io/v3/team_events?event=${selectedEvent}`);

        if (!response.ok) {
            alert('Could not fetch EPAs for this event. They may not be available.');
            return;
        }

        const epas = await response.json();
        if (!epas || epas.length === 0) {
            alert('EPAs not available for this event.');
            return;
        }

        const sortedTeamNumbers = epas.sort((a, b) => b.epa.total_points.mean - a.epa.total_points.mean);
        
        const epaSortedTeams = sortedTeamNumbers.map(teamStat => {
            return teams.find(t => t.team_number == teamStat.team);
        }).filter(Boolean);

        const pickTeamForAlliance = (pickingAlliance, pickingAllianceIndex) => {
            const maxTeams = isFourTeamAlliance ? 4 : 3;
            if (pickingAlliance.teams.length >= maxTeams) return;

            // Get a list of teams that are already on a "full" alliance (2+ members)
            const pickedTeams = alliances
                .filter(a => a.teams.length > 1)
                .flatMap(a => a.teams.map(t => t.team_number));

            // Captains of alliances ranked higher than the current picker are unpickable.
            const unpickableCaptains = alliances
                .slice(0, pickingAllianceIndex)
                .filter(a => a.teams.length === 1)
                .map(a => a.teams[0].team_number);
            
            // The picking alliance cannot pick itself.
            const selfCaptain = pickingAlliance.teams[0].team_number;

            // Find the highest OPR team that is not already picked, not an unpickable captain, and not the picker themselves.
            const teamToPick = epaSortedTeams.find(t => 
                !pickedTeams.includes(t.team_number) &&
                !unpickableCaptains.includes(t.team_number) &&
                t.team_number !== selfCaptain
            );

            if (teamToPick) {
                // Find which alliance this team is currently captain of, if any
                const originalAlliance = alliances.find(a => a.teams.length === 1 && a.teams[0].team_number === teamToPick.team_number);

                // Add the picked team to the picking alliance
                pickingAlliance.teams.push(teamToPick);

                if (originalAlliance) {
                    // The captain was picked. We need to shift all subsequent captains up.
                    const vacantAllianceIndex = alliances.findIndex(a => a.id === originalAlliance.id);

                    if (vacantAllianceIndex !== -1) {
                        // Shift captains up from the vacant spot to the end
                        for (let i = vacantAllianceIndex; i < 7; i++) {
                            alliances[i].teams = alliances[i + 1].teams;
                        }

                        // Now, backfill the last alliance spot with the next highest ranked available team.
                        const allTeamsInAlliancesNow = alliances.flatMap(a => a.teams.map(t => `frc${t.team_number}`));
                        const nextCaptain = rankedTeams.find(rt => !allTeamsInAlliancesNow.includes(rt.team_key));

                        if (nextCaptain) {
                            const teamNumber = nextCaptain.team_key.replace('frc', '');
                            const team = teams.find(t => t.team_number == teamNumber);
                            if (team) {
                                alliances[7].teams = [team]; // Place new captain in the last alliance
                            } else {
                                alliances[7].teams = []; // Should not happen if teams list is correct
                            }
                        } else {
                            // No more available teams, the last alliance becomes empty
                            alliances[7].teams = [];
                        }
                    }
                }
            }
        };

        // Round 2 of picks (serpentine draft: 1->8)
        for (let i = 0; i < 8; i++) {
            pickTeamForAlliance(alliances[i], i);
        }

        // Round 3 of picks (serpentine draft: 8->1)
        for (let i = 7; i >= 0; i--) {
            pickTeamForAlliance(alliances[i], i);
        }

        // Round 4 (if 4-team alliances are enabled: 8->1)
        if (isFourTeamAlliance) {
            for (let i = 7; i >= 0; i--) {
                pickTeamForAlliance(alliances[i], i);
            }
        }
    }

    async function updateAllianceCaptains() {
        if (rankedTeams.length === 0) {
            // If we don't have ranks, we can't do anything.
            // We could try to fetch them, but for now, let's just return.
            return;
        }

        // Find the first empty alliance captain spot (alliances 1-8)
        const emptyAllianceIndex = alliances.findIndex(a => a.id <= 8 && a.teams.length === 0);

        if (emptyAllianceIndex === -1) {
            // No empty spots, nothing to do.
            return;
        }

        // Shift up captains from below
        for (let i = emptyAllianceIndex; i < 7; i++) {
            alliances[i].teams = alliances[i + 1].teams;
        }

        // Now alliance 8 (index 7) is the one to fill.
        // Find the highest-ranked team that is not already in an alliance.
        const teamsInAlliances = alliances.flatMap(a => a.teams.map(t => `frc${t.team_number}`));
        const nextCaptain = rankedTeams.find(rt => !teamsInAlliances.includes(rt.team_key));

        if (nextCaptain) {
            const teamNumber = nextCaptain.team_key.replace('frc', '');
            const team = teams.find(t => t.team_number == teamNumber);
            if (team) {
                alliances[7].teams = [team];
            } else {
                // If team is not in the list, clear the last alliance.
                alliances[7].teams = [];
            }
        } else {
            // No more ranked teams to choose from.
            alliances[7].teams = [];
        }
    }

    function handleDragOver(event) {
        event.preventDefault();
    }

    function handleDragEnter(event, listKey) {
        if (!draggedItem) return;
        const { item, sourceList } = draggedItem;

        if (sourceList !== listKey) return; // Only reorder within the same list

        const list = picklists[listKey].teams;
        const draggedIndex = list.findIndex(t => t.team_number === item.team_number);
        
        const targetElement = event.target.closest('.list-item');
        if (!targetElement) return;

        const targetTeamNumber = Number(targetElement.dataset.teamNumber);
        const dropIndex = list.findIndex(t => t.team_number === targetTeamNumber);

        if (draggedIndex !== -1 && dropIndex !== -1 && draggedIndex !== dropIndex) {
            // Basic reorder logic
            const [draggedTeam] = list.splice(draggedIndex, 1);
            list.splice(dropIndex, 0, draggedTeam);
            // This is a simple implementation. For smoother UX, you might want to check
            // if the item is being dragged over the top or bottom half of the target element.
        }
    }

    async function createOprPicklist() {
        if (!selectedEvent) {
            alert('Please select an event first.');
            return;
        }

        const response = await fetch(`https://www.thebluealliance.com/api/v3/event/${selectedEvent}/oprs`, {
            headers: {
                'X-TBA-Auth-Key': tbaApiKey
            }
        });

        if (!response.ok) {
            alert('Could not fetch OPRs for this event. They may not be available.');
            return;
        }

        const oprs = await response.json();
        if (!oprs || !oprs.oprs) {
            alert('OPRs not available for this event.');
            return;
        }

        const picklistName = 'OPR Rank';
        if (Object.values(picklists).some(p => p.name === picklistName)) {
            alert(`A picklist named "${picklistName}" already exists.`);
            return;
        }

        if (teams.length === 0) {
            await getTeams();
        }

        const sortedTeamNumbers = Object.keys(oprs.oprs).sort((a, b) => oprs.oprs[b] - oprs.oprs[a]);
        
        const sortedTeams = sortedTeamNumbers.map(teamNumber => {
            const teamKey = teamNumber.replace('frc', '');
            return teams.find(t => t.team_number == teamKey);
        }).filter(Boolean);

        const newId = `picklist_${Date.now()}`;
        picklists[newId] = { name: picklistName, teams: sortedTeams };
    }

    async function createEpaPicklist() {
        if (!selectedEvent) {
            alert('Please select an event first.');
            return;
        }

        const response = await fetch(`https://api.statbotics.io/v3/team_events?event=${selectedEvent}`);

        if (!response.ok) {
            alert('Could not fetch EPA data for this event. They may not be available.');
            return;
        }

        const eventData = await response.json();
        if (!eventData || !Array.isArray(eventData)) {
            alert('EPA data not available for this event.');
            return;
        }

        const picklistName = 'EPA Rank';
        if (Object.values(picklists).some(p => p.name === picklistName)) {
            alert(`A picklist named "${picklistName}" already exists.`);
            return;
        }

        if (teams.length === 0) {
            await getTeams();
        }

        const sortedTeamStats = eventData.sort((a, b) => b.epa.stats.mean - a.epa.stats.mean);
        
        const sortedTeams = sortedTeamStats.map(teamStat => {
            return teams.find(t => t.team_number == teamStat.team);
        }).filter(Boolean);

        const newId = `picklist_${Date.now()}`;
        picklists[newId] = { name: picklistName, teams: sortedTeams };
    }

    async function populateAllianceCaptains() {
    if (!selectedEvent) {
        alert('Please select an event first.');
        return;
    }

    try {
        const response = await fetch(`https://www.thebluealliance.com/api/v3/event/${selectedEvent}/teams/statuses`, {
            headers: { 'X-TBA-Auth-Key': tbaApiKey }
        });
        if (!response.ok) throw new Error('Failed to fetch team statuses');
        const statuses = await response.json();

        const localRankedTeams = Object.entries(statuses)
            .map(([teamKey, status]) => ({
                team_key: teamKey,
                rank: status?.qual?.ranking?.rank
            }))
            .filter(t => t.rank != null)
            .sort((a, b) => a.rank - b.rank);

        rankedTeams = localRankedTeams;

        const top8 = rankedTeams.slice(0, 8);

        if (teams.length === 0) {
            await getTeams();
        }

        // Reset alliances
        alliances = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, teams: [] }));

        top8.forEach(rankedTeam => {
            const teamNumber = rankedTeam.team_key.replace('frc', '');
            const team = teams.find(t => t.team_number == teamNumber);
            const allianceIndex = rankedTeam.rank - 1;
            if (team && allianceIndex >= 0 && allianceIndex < 8) {
                alliances[allianceIndex].teams.push(team);
            }
        });

        if (top8.length < 8) {
            alert('Not enough ranked teams to populate all 8 alliance captain spots.');
        }

    } catch (err) {
        console.error(err);
        alert('Failed to populate alliance captains.');
    }
}


    function createAllianceSelection() {
        const name = newAllianceSelectionName.trim();
        if (name && !Object.values(allianceSelections).some(s => s.name === name)) {
            const newId = `selection_${Date.now()}`;
            allianceSelections[newId] = {
                name: name,
                alliances: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, teams: [] })),
                isFourTeamAlliance: false
            };
            activeAllianceSelectionId = newId;
            newAllianceSelectionName = ''; // Clear input after creation
        } else if (!name) {
            alert('Please enter a name for the new alliance selection.');
        } else {
            alert('An alliance selection with that name already exists.');
        }
    }

    function startEditingAllianceSelection() {
        if (!activeAllianceSelectionId) return;
        editingAllianceSelectionId = activeAllianceSelectionId;
        editingAllianceSelectionName = allianceSelections[activeAllianceSelectionId].name;
    }

    function finishEditingAllianceSelection() {
        if (editingAllianceSelectionId === null) return;

        const originalName = allianceSelections[editingAllianceSelectionId]?.name;
        const newName = editingAllianceSelectionName.trim();

        // If name is unchanged, do nothing.
        if (newName === originalName) {
            editingAllianceSelectionId = null;
            editingAllianceSelectionName = '';
            return;
        }

        // If name is changed, validate it.
        if (newName && !Object.values(allianceSelections).some(s => s.name === newName)) {
            allianceSelections[editingAllianceSelectionId].name = newName;
        } else {
            alert('Alliance selection name cannot be empty or already exist.');
        }
        editingAllianceSelectionId = null;
        editingAllianceSelectionName = '';
    }

    function createAndSwitchToNewAllianceSelection(name) {
        let newName = name;
        let counter = 1;
        while (Object.values(allianceSelections).some(s => s.name === newName)) {
            newName = `${name} ${++counter}`;
        }

        const newId = `selection_${Date.now()}`;
        allianceSelections[newId] = {
            name: newName,
            alliances: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, teams: [] })),
            isFourTeamAlliance: isFourTeamAlliance
        };
        activeAllianceSelectionId = newId;
    }

    function deleteAllianceSelection() {
        if (activeAllianceSelectionId === 'default') {
            alert('You cannot delete the Default selection.');
            return;
        }
        if (!activeAllianceSelectionId || Object.keys(allianceSelections).length <= 1) {
            alert('You cannot delete the last alliance selection.');
            return;
        }
        if (confirm(`Are you sure you want to delete the "${allianceSelections[activeAllianceSelectionId].name}" selection?`)) {
            const oldId = activeAllianceSelectionId;
            delete allianceSelections[oldId];
            activeAllianceSelectionId = Object.keys(allianceSelections)[0];
        }
    }

    async function copyAllianceSelection() {
        if (!activeAllianceSelectionId) return;

        const selection = allianceSelections[activeAllianceSelectionId];
        if (!selection) return;

        const dataString = [
            selection.name,
            selection.isFourTeamAlliance ? '1' : '0',
            selection.alliances.map(a => a.teams.map(t => t.team_number).join(',')).join(';')
        ].join('|');

        const compressedData = pako.deflate(dataString);
        const encodedData = bs85.encode(compressedData);

        try {
            await navigator.clipboard.writeText(encodedData);
        } catch (err) {
            console.error('Failed to copy text: ', err);
            alert('Failed to copy alliance selection.');
        }
    }

    function pasteAllianceSelection() {
        const importString = allianceImportData;
        if (!importString) {
            alert('Please paste the alliance selection data into the text box.');
            return;
        }

        try {
            const decodedBuffer = bs85.decode(importString);
            const decompressedData = pako.inflate(decodedBuffer, { to: 'string' });
            
            const parts = decompressedData.split('|');
            if (parts.length !== 3) {
                throw new Error('Invalid data format');
            }

            const [name, isFourTeamStr, alliancesStr] = parts;

            let newName = name;
            let counter = 1;
            while (Object.values(allianceSelections).some(s => s.name === newName)) {
                newName = `${name} (${++counter})`;
            }

            const isFourTeamAlliance = isFourTeamStr === '1';
            const allianceTeamStrs = alliancesStr.split(';');
            const newAlliances = Array.from({ length: 8 }, (_, i) => {
                const teamNumbers = (allianceTeamStrs[i] || '').split(',').filter(Boolean);
                const newTeams = teamNumbers
                    .map(numStr => teams.find(t => t.team_number.toString() === numStr))
                    .filter(Boolean);
                return { id: i + 1, teams: newTeams };
            });

            const newId = `selection_${Date.now()}`;
            allianceSelections[newId] = {
                name: newName,
                alliances: newAlliances,
                isFourTeamAlliance: isFourTeamAlliance
            };
            activeAllianceSelectionId = newId;
            allianceImportData = ''; // Clear the input field
        } catch (error) {
            alert('Failed to parse alliance selection data. Please check the format.');
            console.error('Alliance import error:', error);
        }
    }

    $effect(() => {
        if (activeView === 'alliances' && alliances.every(a => a.teams.length === 0)) {
            populateAllianceCaptains();
        }
    });

    $effect(() => {
        if (!isFourTeamAlliance) {
            alliances.forEach(alliance => {
                if (alliance.teams.length > 3) {
                    alliance.teams.length = 3;
                }
            });
        }
    });

</script>

<div class="page-wrapper">
    <!-- Header Section -->
    <div class="header-section">
        <h1>Picklists & Alliance Selection</h1>
    </div>

    <!-- Top Controls Section -->
    <div class="top-controls">
        <div class="top-left-group">
            <div class="tabs">
                <button class:active={activeView === 'picklists'} on:click={() => activeView = 'picklists'}>
                    Picklists
                </button>
                <button class:active={activeView === 'alliances'} on:click={() => activeView = 'alliances'}>
                    Alliance Selection
                </button>
            </div>
        </div>
        <h3>
                Selected Event:
                {#if selectedEvent}
                    <span>{selectedEvent}</span>
                {:else}
                    <span style="opacity: 0.6;">(none)</span>
                {/if}
        </h3>
    </div>

    <!-- Main Content Area -->
    <div class="main-content" on:dragover={handleDragOver} on:drop|preventDefault={handleDropToRemove}>
        <!-- Team List Sidebar -->
        <div class="team-list-container">
            <h2>Teams</h2>
            <div class="team-list">
                <div class="list" on:dragover={handleDragOver} on:drop={() => { /* Can't drop back on main list */ }}>
                    {#each $teamsStore.filter(team => {
                        // If we're on alliance view, filter out teams that are in alliances
                        if (activeView === 'alliances') {
                            const isInAlliance = alliances.some(alliance => 
                                alliance.teams.some(t => t.team_number === team.team_number)
                            );
                            return !isInAlliance;
                        }
                        return true;
                    }) as team (team.team_number)}
                        <Team {team} picked={!!pickedTeams[team.team_number]} on:click={() => toggleTeamPicked(team.team_number)} on:dragstart={() => handleDragStart(team, 'teams')} />
                    {/each}
                </div>
            </div>
        </div>

        <!-- Right Side View Container -->
        <div class="view-container" on:dragover={handleDragOver} on:drop|preventDefault={handleDropToRemove}>
            {#if activeView === 'picklists'}
                <div class="picklist-view">
                    <!-- Create New Picklist Input -->
                    <div style="margin-bottom: 20px;">
                        <input type="text" bind:value={newPickListName} placeholder="New picklist name" style="width: 300px;" />
                        <button on:click={createPickList}>Create Picklist</button>
                    </div>
                    
                    <div class="container">
                        {#each Object.entries(picklists) as [key, list]}
                            <div class="picklist">
                                <h2>
                                    {#if editingPicklistId === key}
                                        <input
                                            type="text"
                                            bind:value={editingPicklistName}
                                            on:blur={() => finishEditing(key)}
                                            on:keydown={(e) => e.key === 'Enter' && finishEditing(key)}
                                            on:focus={(e) => e.currentTarget.select()}
                                            autofocus
                                        />
                                    {:else}
                                        <span on:click={() => startEditing(key, list.name)}>{list.name}</span>
                                    {/if}
                                    <button on:click={() => deletePickList(key)} style="background: transparent; border: none; font-size: 1.2rem; padding: 0;">X</button>
                                </h2>
                                <div class="list" on:dragover={handleDragOver} on:drop={() => handleDrop(key)} on:dragenter={(e) => handleDragEnter(e, key)}>
                                    {#each list.teams as team (team.team_number)}
                                        <Team {team} picked={!!pickedTeams[team.team_number]} on:click={() => toggleTeamPicked(team.team_number)} on:dragstart={() => handleDragStart(team, key)} />
                                    {/each}
                                </div>
                            </div>
                        {/each}
                    </div>

                    <div class="share-container">
                        <div class="share-controls">
                            <h3>Share Picklists</h3>
                            <p style="margin: 5px 0 10px; font-size: 0.9em; opacity: 0.8;">Generate a code to share your current picklists with others.</p>
                            <button on:click={exportPicklists}>Copy Code to Clipboard</button>
                        </div>
                        <div class="share-controls">
                            <h3>Import Picklists</h3>
                            <textarea bind:value={importData} rows="4" placeholder="Paste shared data string here..."></textarea>
                            <br />
                            <button on:click={importPicklists}>Import Data</button>
                        </div>
                    </div>

                    <div class="fixed-buttons">
                        <button on:click={createOprPicklist}>Create OPR Picklist</button>
                        <button on:click={createEpaPicklist}>Create EPA Picklist</button>
                    </div>
                </div>
            {/if}

            {#if activeView === 'alliances'}
                <div class="alliance-selection">
                    <div class="alliance-with-picklists">
                        <div class="alliance-main">
                            <div class="alliance-controls">
                                <h2>Alliance Selection Board</h2>
                                <div style="display: flex; gap: 20px; align-items: center;">
                                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                                        <input type="checkbox" bind:checked={isFourTeamAlliance} style="width: 20px; height: 20px;" />
                                        4 teams per alliance
                                    </label>
                                    <button on:click={populateAllianceCaptains}>Reset Board</button>
                                </div>
                            </div>
                            
                            <div class="alliances-container">
                                {#each alliances as alliance}
                                    <div class="alliance-list" on:dragover={handleDragOver} on:drop={() => handleDropOnAlliance(alliance.id)}>
                                        <h3>Alliance {alliance.id}</h3>
                                        <div class="list" on:dragover={handleDragOver} on:drop={() => handleDropOnAlliance(alliance.id)}>
                                            {#each alliance.teams as team (team.team_number)}
                                                <Team {team} picked={!!pickedTeams[team.team_number]} on:click={() => toggleTeamPicked(team.team_number)} on:dragstart={() => handleDragStart(team, `alliance_${alliance.id}`)} />
                                            {/each}
                                        </div>
                                    </div>
                                {/each}
                            </div>
                            
                            <div class="fixed-buttons">
                                <button on:click={rankFill}>Fill by Rank</button>
                                <button on:click={oprFill}>Fill by OPR</button>
                                <button on:click={epaFill}>Fill by EPA</button>
                            </div>
                        </div>
                        
                        <div class="picklists-sidebar">
                            <h2>Picklists</h2>
                            <div class="picklists-scroll">
                                {#if Object.keys(picklists).length === 0}
                                    <p style="padding: 20px; text-align: center; opacity: 0.6;">No picklists created yet</p>
                                {:else}
                                    {#each Object.entries(picklists) as [key, list]}
                                        <div class="sidebar-picklist">
                                            <h3>{list.name}</h3>
                                            <div class="sidebar-list">
                                                {#each list.teams as team, index (team.team_number)}
                                                    <div 
                                                        class="sidebar-team" 
                                                        class:picked={!!pickedTeams[team.team_number]}
                                                        draggable="true" 
                                                        on:dragstart={() => handleDragStart(team, key)}
                                                        on:click={() => toggleTeamPicked(team.team_number)}>
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
    
    {#if activeView === 'alliances'}
    <div class="bottom-bar">
        <div class="alliance-management">
            <div class="current-selection-display">
                {#if editingAllianceSelectionId === activeAllianceSelectionId}
                    <input
                        type="text"
                        bind:value={editingAllianceSelectionName}
                        on:blur={finishEditingAllianceSelection}
                        on:keydown={(e) => e.key === 'Enter' && finishEditingAllianceSelection()}
                        on:focus={(e) => e.currentTarget.select()}
                        autofocus
                    />
                {:else}
                    <span on:click={startEditingAllianceSelection} title="Click to rename">
                        {allianceSelections[activeAllianceSelectionId]?.name || 'Select a selection'}
                    </span>
                {/if}
            </div>

            <select id="alliance-selection-switcher" bind:value={activeAllianceSelectionId} style="background: #333; border: 1px solid #555;">
                {#each Object.entries(allianceSelections) as [id, selection]}
                    <option value={id}>{selection.name}</option>
                {/each}
            </select>
            
            <button on:click={deleteAllianceSelection} disabled={Object.keys(allianceSelections).length <= 1 || activeAllianceSelectionId === 'default'}>Delete</button>
            <div style="width: 1px; height: 20px; background: #555; margin: 0 5px;"></div>
            <button on:click={copyAllianceSelection}>Copy</button>
            <input type="text" bind:value={allianceImportData} placeholder="Paste data..." style="width: 150px;" />
            <button on:click={pasteAllianceSelection}>Paste</button>
            
            <div style="width: 1px; height: 20px; background: #555; margin: 0 5px;"></div>
            
            <input type="text" bind:value={newAllianceSelectionName} placeholder="New list name" on:keydown={(e) => e.key === 'Enter' && createAllianceSelection()} style="width: 150px;" />
            <button on:click={createAllianceSelection}>New</button>
        </div>
    </div>
    {/if}
</div>

<style>
    /* FRC 190 Brand Colors & Global Resets */
    :root {
        --frc-190-red: #C81B00;
        --wpi-gray: #A9B0B7;
        --frc-190-black: #4D4D4D;
        --dark-bg: #1a1a1a;
        --darker-bg: #121212;
        --card-bg: #2d2d2d;
    }

    :global(html), :global(body) {
        margin: 0;
        padding: 0;
        background: var(--wpi-gray);
        height: 100vh;
        width: 100vw;
        overflow-x: hidden;
    }

    :global(body) {
        margin: 0 !important;
        padding: 0 !important;
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
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }

    button:active {
        transform: translateY(0);
    }

    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
    }

    input[type="text"], textarea, select {
        padding: 8px 12px;
        border: 2px solid var(--frc-190-red);
        background: #333;
        color: white;
        border-radius: 6px;
        font-size: 14px;
    }

    input[type="text"]:focus, textarea:focus, select:focus {
        outline: none;
        box-shadow: 0 0 0 2px rgba(200, 27, 0, 0.4);
    }

    /* Page Layout */
    .page-wrapper {
        display: flex;
        flex-direction: column;
        align-items: stretch; /* Changed from center to stretch for full width */
        min-height: 100vh;
        padding: 0; /* No padding at all */
        margin: 0; /* No margin */
        background: var(--wpi-gray);
        padding-bottom: 80px; /* Space for fixed bottom bar */
    }

    .header-section {
        text-align: center;
        margin: 0 0 10px 0;
        width: 100%;
        padding: 10px 0; /* Just vertical padding */
    }

    .header-section h1 {
        color: var(--frc-190-red);
        font-size: 2.5rem;
        font-weight: 800;
        margin: 0 0 5px 0;
        text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
        letter-spacing: 1px;
    }

    /* Top Controls Area */
    .top-controls {
        width: 100%; /* Full width */
        max-width: none; /* No limit */
        background: var(--dark-bg);
        padding: 10px 15px; /* Reduced vertical padding */
        border-radius: 0; /* No border radius for full width */
        border: 2px solid var(--frc-190-red);
        border-left: none;
        border-right: none;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        margin-bottom: 5px; /* Minimal margin */
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
        gap: 0;
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

    .api-controls {
        display: flex;
        gap: 10px;
        align-items: center;
    }

    /* Main Content Area */
    .main-content {
        display: flex;
        width: 100%;
        max-width: none; /* No limit - as wide as possible */
        gap: 5px; /* Absolute minimum gap */
        align-items: flex-start;
        padding: 0; /* No padding at all */
        margin: 0; /* No margin */
    }

    /* Team List Sidebar */
    .team-list-container {
        width: 150px; /* Ultra minimal */
        background: var(--dark-bg);
        border: 2px solid var(--frc-190-black);
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        height: 75vh;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
    }
    
    .team-list-container h2 {
        background: var(--frc-190-red);
        color: white;
        margin: 0;
        padding: 10px;
        text-align: center;
        font-size: 1.2rem;
    }

    .team-list {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
    }

    /* View Container (Picklists/Alliances) */
    .view-container {
        flex: 1;
        min-width: 0; /* allows flex shrink */
    }

    /* Picklist Grid */
    .container {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 20px;
        margin-top: 20px;
    }

    .picklist, .alliance-list {
        background: var(--dark-bg);
        border: 2px solid var(--frc-190-black);
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        min-height: 400px; /* Changed to min-height for flexibility */
        overflow: hidden;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    }

    .picklist h2, .alliance-list h3 {
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
        background: rgba(0,0,0,0.2);
        border: 1px solid rgba(255,255,255,0.3);
        color: white;
        width: 70%;
    }

    .picklist .list, .alliance-list .list {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
        background: #252525; /* Slightly lighter inner background */
    }

    /* Share Section in Picklists */
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
    
    .share-controls h2, .share-controls h3 {
        margin-top: 0;
        color: var(--frc-190-red);
    }

    /* Fixed floating buttons */
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
        box-shadow: 0 4px 10px rgba(0,0,0,0.5);
    }

    /* Alliance Selection View */
    .alliance-with-picklists {
        display: flex;
        gap: 5px; /* Minimum gap */
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
        grid-template-columns: repeat(4, 1fr); /* 4 columns = all 8 alliances visible */
        gap: 8px; /* Minimum practical gap */
        max-width: 100%;
    }
    @media (max-width: 1600px) {
        .alliances-container {
            grid-template-columns: repeat(2, 1fr);
        }
    }

    /* Picklists Sidebar */
    .picklists-sidebar {
        width: 140px; /* Ultra minimal - just team numbers */
        background: var(--dark-bg);
        border: 2px solid var(--frc-190-black);
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        height: 75vh;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
    }

    .picklists-sidebar h2 {
        background: var(--frc-190-red);
        color: white;
        margin: 0;
        padding: 10px;
        text-align: center;
        font-size: 1.2rem;
    }

    .picklists-scroll {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
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
        color: white;
    }

    .sidebar-team:hover {
        background: #222;
        border-color: var(--frc-190-red);
        transform: translateX(2px);
    }

    .sidebar-team:active {
        cursor: grabbing;
    }

    .rank-number {
        text-align: center;
        color: var(--frc-190-red);
        font-weight: bold;
        font-size: 0.85rem;
    }

    .team-number {
        font-weight: bold;
        color: #fff;
    }

    .team-name {
        color: #aaa;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 0.85rem;
    }

    /* Bottom Fixed Bar style */
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
        box-shadow: 0 -4px 10px rgba(0,0,0,0.3);
    }
    
    .alliance-management {
        background: #222;
        padding: 10px 20px;
        border-radius: 50px; /* Pill shape */
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

    /* Scrollbar Styling */
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
</style>