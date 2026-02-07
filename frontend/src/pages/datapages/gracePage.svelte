<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { postGracePage, fetchGracePage } from "../../utils/api";
  import Team from "../../components/Team.svelte";
    import { init } from "echarts";

  //Variables
  let allTeams = []; //for dropdown
  let selectedTeam = "Select a team";
  let tableData = [];
  let isSubmitting = false;
  const rating = [new URL("../../images/DNP.png", import.meta.url).href, new URL("../../images/ProbNo.png", import.meta.url).href, new URL("../../images/NeutralBad.jpg", import.meta.url).href, new URL("../../images/NeutralGood.png", import.meta.url).href, new URL("../../images/PrettyGood.gif", import.meta.url).href, new URL("../../images/AHHHHH.png", import.meta.url).href, new URL("../../images/FIRSTpick.gif", import.meta.url).href ];
  const apiKey = import.meta.env.VITE_BA_AUTH_KEY;
  const eventCode = localStorage.getItem("eventCode");

  let teams = new Map();
  let originalTitle = "";

  onMount(async () => {
    originalTitle = document.title;
    document.title = "GARCE PAGE";
    allTeams = await loadTeamNumbers();
    console.log(allTeams);
    console.log("AUTH Key:", apiKey);
    // for (let i = 0; i < allTeams.length; i++){
    //   teamNames.push(await fetchNames(allTeams[i]));
    // }
    fetchNames().then(() => {
      fetchPastData();
    });
  });

  onDestroy(() => {
    document.title = originalTitle;
  });

  function fetchPastData() {
    fetchGracePage(eventCode).then(res => {
      if (!res.ok) throw new Error("Network response was not ok");
      return res.json(); 
    }).then(data => {
      console.log(data);
      for (let team of Object.keys(data)) {
        tableData = [
          ...tableData,
          {
            team: team,
            name: teams.get(parseInt(team)),
            rating: data[team][Object.keys(data[team]).length - 1],
          },
        ];
      }
    }).catch(err => {
      console.error("Failed to fetch Grace page:", err);
    });
  }

  async function fetchNames() {
    const apiUrl = `https://www.thebluealliance.com/api/v3/event/${eventCode}/teams/simple`;

    try {
      const response = await fetch(apiUrl, {
        headers: {
          "X-TBA-Auth-Key": apiKey,
        },
      });

      const data = await response.json();
      allTeams = data.map((team) => team.team_number).sort((a, b) => a - b);
      console.log("Fetched team data:", data);
      for (let i = 0; i < data.length; i++) {
        teams.set(data[i].team_number, data[i].nickname);
      }
      teams = teams;
      console.log("Teams Map:", teams);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // const data = await response.json();
      // selectedTeamName = data.nickname || data.name || "Team name not found";
      // console.log("Team data:", data);
      // console.log("Selected Team Name:", selectedTeamName);
      // return selectedTeamName;
    } catch (error) {
      console.error("There was a problem fetching team data:", error);
    }
  }

  async function loadTeamNumbers() {
    const apiUrl = `https://www.thebluealliance.com/api/v3/event/${eventCode}/teams/simple`;

    try {
      const response = await fetch(apiUrl, {
        headers: {
          "X-TBA-Auth-Key": apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      let teams = [];
      for (let team_ of data) {
        const teamNumber = parseInt(team_.team.slice(3));
        teams.push(teamNumber);
      }
      return teams;
    } catch (error) {
      console.error("There was a problem fetching team data:", error);
    }
  }

  async function handleRatingClick(ratingEmoji: string, i) {
    if (isSubmitting == true) return;

    isSubmitting = true;
    if (selectedTeam === "Select a team") {
      alert("Please select a team first!");
      isSubmitting = false;
      return;
    } 

    await postGracePage(eventCode, selectedTeam, i);

    const existingIndex = tableData.findIndex(
      (row) => row.team === selectedTeam,
    );

    if (existingIndex !== -1) {
      tableData[existingIndex].rating = ratingEmoji;
      tableData[existingIndex].name = teams.get(selectedTeam);
    } else {
      tableData = [
        ...tableData,
        {
          team: selectedTeam,
          name: teams.get(selectedTeam),
          rating: ratingEmoji,
        },
      ];
    }

    isSubmitting = false;
  }
</script>

<div class="inputSection">
  <label for="teams">Choose a Team:</label>
  <select id="teams" name="teams" bind:value={selectedTeam}>
    <option value="Select a team">Select a team</option>
    {#each allTeams as team}
      <option value={team}>{team}</option>
    {/each}
  </select>
  <br /><br />
  <div class="ratingSection">
    <p>Rating:</p>
    <div class="ratingButtonContainer">
      {#each rating as ratingEmoji, i}
        <button on:click={() => handleRatingClick(ratingEmoji, i + 1)}>
          <img src={ratingEmoji} alt="Rating Emoji" width="40" height="40"  />
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
            <td><img src={row.rating} alt="Rating Emoji" width="40" height="40" /></td>
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
