<script>
    import baseX from 'base-x';
    import Team from '../../components/Team.svelte';

    const BASE85_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~';
    const bs85 = baseX(BASE85_CHARS);
    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();

    let events = $state([]);
    let selectedEvent = $state('');
    let teams = $state([]);
    let picklists = $state({});
    let tbaApiKey = $state('zhTqFG7csJoif1sNXt3aZngy0LB1X4LxMgTfXBvPscNG0P9FifZCa2uGJcUk2gKW');

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

    async function exportPicklists() {
        const dataToShare = {
            picklists: picklists,
            pickedTeams: pickedTeams
        };
        const dataString = JSON.stringify(dataToShare);
        const buffer = textEncoder.encode(dataString);
        const encodedData = bs85.encode(buffer);
        try {
            await navigator.clipboard.writeText(encodedData);
            alert('Picklists copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy text: ', err);
            alert('Failed to copy picklists.');
        }
    }

    function importPicklists() {
        if (!importData) {
            alert('Please paste the data to import.');
            return;
        }
        try {
            const buffer = bs85.decode(importData);
            const decodedData = textDecoder.decode(buffer);
            const parsedData = JSON.parse(decodedData);
            if (parsedData.picklists && parsedData.pickedTeams) {
                picklists = parsedData.picklists;
                pickedTeams = parsedData.pickedTeams;
                importData = '';
                alert('Picklists imported successfully!');
            } else {
                alert('Invalid import data format.');
            }
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

        if (editingPicklistName && !Object.values(picklists).some(p => p.name === editingPicklistName && id !== p.id)) {
            picklists[id].name = editingPicklistName;
        } else {
            alert('Picklist name cannot be empty or already exist.');
        }
        editingPicklistId = null;
        editingPicklistName = '';
    }

    function deletePickList(key) {
        const newPicklists = { ...picklists };
        delete newPicklists[key];
        picklists = newPicklists;
    }

    async function getEvents() {
        if (!tbaApiKey) {
            alert('Please enter your TBA API Key');
            return;
        }
        const year = new Date().getFullYear();
        const response = await fetch(`https://www.thebluealliance.com/api/v3/events/${year}/simple`, {
            headers: {
                'X-TBA-Auth-Key': tbaApiKey
            }
        });
        events = await response.json();
    }

    async function getTeams() {
        if (!selectedEvent) return;
        const response = await fetch(`https://www.thebluealliance.com/api/v3/event/${selectedEvent}/teams/simple`, {
            headers: {
                'X-TBA-Auth-Key': tbaApiKey
            }
        });
        teams = await response.json();
        // Reset picklists when new teams are fetched
        for (let list in picklists) {
            picklists[list].teams = [];
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
        if (rankedTeams.length === 0) {
            alert('Please ensure team rankings are loaded by visiting the alliance tab first.');
            return;
        }

        // --- Special First Round Pick (Cascading) ---
        for (let i = 0; i < 7; i++) {
            const pickingAlliance = alliances[i];
            const targetAlliance = alliances[i + 1];

            if (pickingAlliance.teams.length >= 2) continue; // Already picked its second member

            if (targetAlliance && targetAlliance.teams.length > 0) {
                const teamToPick = targetAlliance.teams[0]; // The captain of the next alliance

                // 1. Add the picked team to the current alliance
                pickingAlliance.teams.push(teamToPick);

                // 2. Shift all subsequent alliance captains up
                for (let j = i + 1; j < 7; j++) {
                    alliances[j].teams = alliances[j + 1].teams;
                }

                // 3. Backfill the last alliance with the new highest-ranked available team
                const teamsInAlliances = () => alliances.flatMap(a => a.teams.map(t => `frc${t.team_number}`));
                const nextCaptain = rankedTeams.find(rt => !teamsInAlliances().includes(rt.team_key));

                if (nextCaptain) {
                    const teamNumber = nextCaptain.team_key.replace('frc', '');
                    const team = teams.find(t => t.team_number == teamNumber);
                    if (team) {
                        alliances[7].teams = [team];
                    } else {
                        alliances[7].teams = []; // Should not happen if teams list is correct
                    }
                } else {
                    alliances[7].teams = []; // No more teams to choose from
                }
            }
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

        const areCaptainsSet = alliances.every(a => a.teams.length > 0);
        if (!areCaptainsSet) {
            alert('Please populate all alliance captains first by clicking "Reset & Repopulate Captains".');
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
                    // The captain was picked, so their original alliance needs a new captain.
                    originalAlliance.teams = []; // Vacate the spot

                    // Find the next highest *ranked* team that is not in any alliance
                    const allTeamsInAlliancesNow = alliances.flatMap(a => a.teams.map(t => `frc${t.team_number}`));
                    const nextCaptain = rankedTeams.find(rt => !allTeamsInAlliancesNow.includes(rt.team_key));

                    if (nextCaptain) {
                        const teamNumber = nextCaptain.team_key.replace('frc', '');
                        const team = teams.find(t => t.team_number == teamNumber);
                        if (team) {
                            originalAlliance.teams.push(team);
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
        
        // This is needed to force svelte to re-render the alliances
        alliances = [...alliances];
    }

    async function epaFill() {
        if (!selectedEvent) {
            alert('Please select an event first.');
            return;
        }

        const areCaptainsSet = alliances.every(a => a.teams.length > 0);
        if (!areCaptainsSet) {
            alert('Please populate all alliance captains first by clicking "Reset & Repopulate Captains".');
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

        const sortedTeamStats = eventData.sort((a, b) => b.epa.stats.mean - a.epa.stats.mean);
        
        const sortedTeams = sortedTeamStats.map(teamStat => {
            return teams.find(t => t.team_number == teamStat.team);
        }).filter(Boolean);

        const pickTeamForAlliance = (alliance) => {
            const maxTeams = isFourTeamAlliance ? 4 : 3;
            if (alliance.teams.length >= maxTeams) return; // Alliance is full

            if (sortedTeams.length > 0) {
                const teamToPick = sortedTeams.shift();
                if (teamToPick) {
                    alliance.teams.push(teamToPick);
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

        const response = await fetch(`https://www.thebluealliance.com/api/v3/event/${selectedEvent}/teams/statuses`, {
            headers: {
                'X-TBA-Auth-Key': tbaApiKey
            }
        });

        if (!response.ok) {
            alert('Could not fetch team statuses for this event. They may not be available.');
            return;
        }

        const statuses = await response.json();
        if (!statuses) {
            alert('Team statuses not available for this event.');
            return;
        }

        const localRankedTeams = Object.entries(statuses)
            .map(([teamKey, status]) => ({
                team_key: teamKey,
                rank: status?.qual?.ranking?.rank
            }))
            .filter(team => team.rank !== null && team.rank !== undefined)
            .sort((a, b) => a.rank - b.rank);
        
        rankedTeams = localRankedTeams;

        const top8 = rankedTeams.slice(0, 8);

        if (top8.length < 8) {
            alert('Not enough ranked teams to populate all 8 alliance captain spots.');
        }

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
                if (!alliances[allianceIndex].teams.some(t => t.team_number === team.team_number)) {
                    alliances[allianceIndex].teams.push(team);
                }
            }
        });
    }


</script>

<main>
    <h1>Picklist</h1>

    <div class="tabs">
        <button class:active={activeView === 'picklists'} on:click={() => activeView = 'picklists'}>
            Picklists
        </button>
        <button class:active={activeView === 'alliances'} on:click={() => activeView = 'alliances'}>
            Alliance Selection
        </button>
    </div>

    <div>
        <label for="tba-key">TBA API Key:</label>
        <input type="text" id="tba-key" bind:value={tbaApiKey}>
        <button on:click={getEvents}>Get Events</button>
    </div>

    {#if events.length > 0}
        <div>
            <label for="event-select">Select Event:</label>
            <select id="event-select" bind:value={selectedEvent} on:change={getTeams}>
                <option value="">--Select an Event--</option>
                {#each events as event}
                    <option value={event.key}>{event.name}</option>
                {/each}
            </select>
        </div>
    {/if}

    <div class="main-content">
        <div class="team-list-container">
            <div class="team-list">
                <h2>Teams</h2>
                <div class="list" on:dragover={handleDragOver} on:drop={() => { /* Can't drop back on main list */ }}>
                    {#each teams as team (team.team_number)}
                        <Team {team} picked={!!pickedTeams[team.team_number]} on:click={() => toggleTeamPicked(team.team_number)} on:dragstart={() => handleDragStart(team, 'teams')} />
                    {/each}
                </div>
            </div>
        </div>

        <div class="view-container">
            {#if activeView === 'picklists'}
                <div class="picklist-view">
                    <div class="controls">
                        <input type="text" bind:value={newPickListName} placeholder="New picklist name" />
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
                                    <button on:click={() => deletePickList(key)}>X</button>
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
                            <h2>Share & Import</h2>
                            <button on:click={exportPicklists}>Copy Picklists to Clipboard</button>
                        </div>
                        <div class="share-controls">
                            <h3>Import Picklists</h3>
                            <textarea bind:value={importData} rows="8" placeholder="Paste shared data here..."></textarea>
                            <br />
                            <button on:click={importPicklists}>Import</button>
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
                    <div class="alliance-controls">
                        <h2>Alliance Selection</h2>
                        <div>
                            <label>
                                <input type="checkbox" bind:checked={isFourTeamAlliance} />
                                4 teams per alliance
                            </label>
                        </div>
                        <button on:click={rankFill}>Fill Based on Rank</button>
                        <button on:click={oprFill}>Fill Based on OPR</button>
                        <button on:click={epaFill}>Fill Based on EPA</button>
                        <button on:click={populateAllianceCaptains}>Reset</button>
                    </div>
                    <div class="alliances-container">
                        {#each alliances as alliance}
                            <div class="alliance-list" on:dragover={handleDragOver} on:drop={() => handleDropOnAlliance(alliance.id)}>
                                <h3>Alliance {alliance.id}</h3>
                                <div class="list">
                                    {#each alliance.teams as team (team.team_number)}
                                        <Team {team} picked={!!pickedTeams[team.team_number]} on:click={() => toggleTeamPicked(team.team_number)} on:dragstart={() => handleDragStart(team, `alliance_${alliance.id}`)} />
                                    {/each}
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>
    </div>
</main>

<style>
    .tabs {
        margin-bottom: 20px;
    }
    .tabs button {
        padding: 10px 20px;
        border: 1px solid #ccc;
        background-color: #000000;
        color: #ffffff;
        cursor: pointer;
    }
    .tabs button.active {
        background-color: #e7e7e7;
        color: #000000;
        border-bottom: 1px solid #fff;
    }
    .main-content {
        display: flex;
        gap: 20px;
    }
    .team-list-container {
        width: 300px;
        flex-shrink: 0;
    }
    .view-container {
        flex-grow: 1;
        overflow-x: auto;
    }
    .picklist-view .container {
        display: flex;
        gap: 20px;
        overflow-x: auto;
        padding-bottom: 10px;
    }
    .team-list, .picklist {
        width: 300px;
        border: 1px solid #ccc;
        border-radius: 5px;
        padding: 10px;
    }
    .list {
        min-height: 200px;
        background-color: #f9f9f9;
        padding: 5px;
    }
    .controls {
        margin-top: 20px;
    }
    h2 button {
        font-size: 0.8rem;
        margin-left: 10px;
        cursor: pointer;
    }
    h2 span {
        cursor: pointer;
    }
    .share-container {
        display: flex;
        gap: 20px;
        margin-top: 20px;
    }
    .share-controls {
        flex: 1;
        padding: 10px;
        border: 1px solid #ccc;
        border-radius: 5px;
    }
    .share-controls textarea {
        width: 100%;
        box-sizing: border-box;
        margin-top: 10px;
    }
    .share-controls button {
        margin-top: 10px;
    }
    .fixed-buttons {
        position: fixed;
        bottom: 20px;
        right: 20px;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    .alliance-controls {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 20px;
    }
    .alliance-selection {
        margin-top: 20px;
    }
    .alliances-container {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap: 20px;
    }
    .alliance-list {
        border: 1px solid #ccc;
        border-radius: 5px;
        padding: 10px;
    }
    .alliance-list h3 {
        margin-top: 0;
    }
</style>