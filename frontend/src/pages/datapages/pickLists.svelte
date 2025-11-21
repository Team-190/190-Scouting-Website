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


</script>

<main>
    <h1>Picklist</h1>

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

    <div class="container">
        <div class="team-list">
            <h2>Teams</h2>
            <div class="list" on:dragover={handleDragOver} on:drop={() => { /* Can't drop back on main list */ }}>
                {#each teams as team (team.team_number)}
                    <Team {team} picked={!!pickedTeams[team.team_number]} on:click={() => toggleTeamPicked(team.team_number)} on:dragstart={() => handleDragStart(team, 'teams')} />
                {/each}
            </div>
        </div>

        {#each Object.entries(picklists) as [key, list]}
            <div class="picklist">
                <h2>
                    {#if editingPicklistId === key}
                        <input
                            type="text"
                            bind:value={editingPicklistName}
                            on:blur={() => finishEditing(key)}
                            on:keydown={(e) => e.key === 'Enter' && finishEditing(key)}
                            on:focus={(e) => e.target.select()}
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
    <div class="controls">
        <input type="text" bind:value={newPickListName} placeholder="New picklist name" />
        <button on:click={createPickList}>Create Picklist</button>
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

</main>

<style>
    .container {
        display: flex;
        gap: 20px;
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
</style>