<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { postGracePage, fetchGracePage } from "../../utils/api";
  import { fetchTeams } from "../../utils/externalApi";

  //Variables
  let selectedTeam = "Select a team";
  let tableData = [];
  let isSubmitting = false;
  const rating = [
    new URL("../../images/DNP.png", import.meta.url).href,
    new URL("../../images/ProbNo.png", import.meta.url).href,
    new URL("../../images/NeutralBad.jpg", import.meta.url).href,
    new URL("../../images/NeutralGood.png", import.meta.url).href,
    new URL("../../images/PrettyGood.gif", import.meta.url).href,
    new URL("../../images/AHHHHH.png", import.meta.url).href,
    new URL("../../images/FIRSTpick.gif", import.meta.url).href,
    new URL("../../images/horse.png", import.meta.url).href,
  ];
  let eventCode = localStorage.getItem("eventCode");
  // eventCode = "2025mawor";

  let originalTitle = "";
  let teams = new Map();
  let allTeams = [];

  onMount(async () => {
    originalTitle = document.title;
    document.title = "GARCE PAGE";
    // for (let i = 0; i < allTeams.length; i++){
    //   teamNames.push(await fetchTeams(allTeams[i]));
    // }

    const result = await fetchTeams(eventCode);
    teams = result._teams;
    allTeams = result._teamNumbers;

    addPastData();
  });

  onDestroy(() => {
    document.title = originalTitle;
  });

  function addPastData() {
    try {
      tableData = allTeams.map((teamNumber) => ({
        team: teamNumber,
        name: teams.get(teamNumber),
        rating: rating[7],
      }));
      fetchGracePage(eventCode)
        .then((res) => {
          if (!res.ok) throw new Error("Network response was not ok");
          return res.json();
        })
        .then((data) => {
          for (let team of Object.keys(data)) {
            let savedRatings = data[team];
            let lastIndex = Object.keys(savedRatings).length - 1;
            let savedRatingIndex = savedRatings[lastIndex];
            let rowIndex = tableData.findIndex((row) => row.team == team);
            if (rowIndex !== -1) {
              tableData[rowIndex].rating = rating[savedRatingIndex];
            }
            // tableData = [
            //   ...tableData,
            //   {
            //     team: team,
            //     name: teams.get(parseInt(team)),
            //     rating: rating[data[team][Object.keys(data[team]).length - 1]],
            //   },
            // ];
          }
        })
    } catch (err) {
      console.error("Failed to initialize table data:", err);
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

    if (!eventCode) {
      alert("Event code is not set. Please set an event code first.");
      isSubmitting = false;
      return;
    }

    try {
      await postGracePage(eventCode, Number(selectedTeam), i);

      const existingIndex = tableData.findIndex(
        (row) => row.team == selectedTeam,
      );

      if (existingIndex !== -1) {
        tableData[existingIndex].rating = ratingEmoji;
        tableData[existingIndex].name = teams.get(selectedTeam);
      } else {
        tableData = [
          ...tableData,
          {
            team: selectedTeam,
            name: teams.get(parseInt(selectedTeam)),
            rating: ratingEmoji,
          },
        ];
      }
    } catch (error) {
      console.error("Failed to submit rating:", error);
      alert("Failed to submit rating. Please try again.");
    } finally {
      isSubmitting = false;
    }
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
        <button on:click={() => handleRatingClick(ratingEmoji, i)}>
          <img src={ratingEmoji} alt="Rating Emoji" width="40" height="40" />
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
            <td
              ><img
                src={row.rating}
                alt="Rating Emoji"
                width="40"
                height="40"
              /></td
            >
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

  select {
    padding: 8px 12px;
    border: 2px solid var(--frc-190-red);
    background: #333;
    color: white;
    border-radius: 6px;
    font-size: 14px;
  }

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
