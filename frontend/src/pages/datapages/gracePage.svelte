<script lang="ts">
  import { onMount } from "svelte";

  //Variables
  let allTeams = [];
  let selectedTeam = "Select a team";
  let tableData = [];
  let rating = ["🤮", "😨", "🥱", "🙂", "🤑", "💍"];
  let selectedTeamName;
  const apiKey = import.meta.env.VITE_BA_AUTH_KEY;
  

  onMount(async () => {
    document.title = "GARCE - FRC 190";
    allTeams = await loadTeamNumbers();
    console.log(allTeams);
    console.log("AUTH Key:", apiKey);
  });

  async function fetchTeamName(teamNumber: string) {
    const apiUrl = `https://www.thebluealliance.com/api/v3/team/frc${teamNumber}`;

    try {
      const response = await fetch(apiUrl, {
        headers: {
          "X-TBA-Auth-Key": apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      selectedTeamName = data.nickname || data.name || "Team name not found";
      console.log("Team data:", data);
      console.log("Selected Team Name:", selectedTeamName);
      

    } catch (error) {
      console.error('There was a problem fetching team data:', error);
      selectedTeamName = "Error fetching team name";
      
    }
  }


  async function loadTeamNumbers() {
    const eventCode = localStorage.getItem("eventCode");
    if (!eventCode) return alert("get an event code, fool");
    console.log(eventCode);
    const data = await (
      await fetch("http://localhost:8000/teamNumbers?eventCode="+eventCode)
    ).json();
    console.log("gotteam numbers:"+data)
    return data;
  }

  function handleRatingClick(ratingEmoji: string) {
    if (selectedTeam === "Select a team") {
      alert("Please select a team first!");
      return;
    }

    const existingIndex = tableData.findIndex(
      (row) => row.team === selectedTeam,
    );

    if (existingIndex !== -1) {
      tableData[existingIndex].rating = ratingEmoji;
      tableData[existingIndex].name = selectedTeamName;
    } else {
      
      tableData = [...tableData, { team: selectedTeam, name: selectedTeamName, rating: ratingEmoji }];
    }
  }
</script>

<div class="inputSection">
  <label for="teams">Choose a Team:</label>
  <select id="teams" name="teams" bind:value={selectedTeam} on:change={() => fetchTeamName(selectedTeam)}>
    <option value="Select a team">Select a team</option>
    {#each allTeams as team}
      <option value={team}>{team}</option>
    {/each}
  </select>
  <br /><br />
  <div class="ratingSection">
    <p>Rating:</p>
    <div class="ratingButtonContainer">
      {#each rating as ratingEmoji}
        <button on:click={() => handleRatingClick(ratingEmoji)}>
          {ratingEmoji}
        </button>
      {/each}
    </div>
    <table>
      <thead>
        <tr>
          <th>Team #</th>
          <th>Team Name</th>
          <th>Rating</th>
        </tr>
      </thead>
      <tbody>
        {#each tableData as row}
          <tr>
            <td>{row.team}</td>
            <td>{row.name}</td>
            <td>{row.rating}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>


<style>
  :root {
    --frc-190-red: #c81b00;
    --wpi-gray: #a9b0b7;
    --frc-190-black: #4d4d4d;
    --dark-bg: #1a1a1a;
    --darker-bg: #121212;
    --card-bg: #2d2d2d;
  }

  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    background: var(--wpi-gray);
    height: 100vh;
    width: 100vw;
    overflow-x: hidden;
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

  .ratingSection {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .ratingButtonContainer {
    display: flex;
    gap: 10px;
    margin-top: 10px;
  }

  table,
  th,
  td {
    margin-top: 10px;
    border: solid #642a75;
    color: var(--dark-bg);
    background-color: white;
    border-collapse: collapse;
    padding: 10px;
  }
</style>
