<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { fetchAnanthPage, postAnanthPage, fetchTeams } from "../../utils/api";
  import { getAnanthRatings, getEventCode } from "../../utils/pageUtils";

  //Variables
  let selectedTeam = "Select a team";
  let tableData = [];
  let isSubmitting = false;
  const rating = getAnanthRatings();
  let eventCode = getEventCode();

  let originalTitle = "";
  let teams = new Map();
  let allTeams = [];

  onMount(async () => {
    originalTitle = document.title;
    document.title = "ANANTH PAGE";

    const result = await fetchTeams(eventCode);
    teams = new Map(Object.entries(result._teams).map(([k, v]) => [Number(k), v]));
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
        rating: rating[rating.length - 1],
      }));
      fetchAnanthPage(eventCode)
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
      await postAnanthPage(eventCode, Number(selectedTeam), i);

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
            <td data-label="Team #">{row.team}</td>
            <td data-label="Team Name">{row.name}</td>
            <td data-label="Rating"
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
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  }

  :global(*) {
    box-sizing: border-box;
  }

  .inputSection {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  label {
    font-size: 1rem;
    font-weight: 600;
    color: var(--frc-190-black);
    margin-bottom: 0.5rem;
    display: block;
  }

  select {
    width: 100%;
    max-width: 300px;
    padding: 0.75rem;
    border: 2px solid var(--frc-190-red);
    background: #333;
    color: white;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
  }

  select:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(200, 27, 0, 0.2);
  }

  button {
    cursor: pointer;
    padding: 0.75rem 1rem;
    border: 2px solid var(--frc-190-red);
    background: linear-gradient(135deg, #333 0%, #444 100%);
    color: white;
    font-weight: 600;
    border-radius: 6px;
    transition: all 0.2s;
    font-size: 0.9rem;
  }

  button:hover {
    background: linear-gradient(135deg, #444 0%, #555 100%);
    border-color: #e02200;
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }

  button:active {
    transform: translateY(0);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  button img {
    display: block;
  }

  .ratingSection {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .ratingSection p {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--frc-190-black);
    margin: 0;
  }

  .ratingButtonContainer {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: center;
  }

  .ratingButtonContainer button {
    padding: 0.5rem;
    min-width: 50px;
  }

  .ratingButtonContainer img {
    width: 40px;
    height: 40px;
    pointer-events: none;
  }

  /* Desktop Table */
  table {
    width: 100%;
    margin-top: 1.5rem;
    border-collapse: collapse;
    background-color: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  thead {
    background-color: var(--frc-190-red);
    color: white;
    font-weight: 600;
  }

  th {
    padding: 1rem;
    text-align: left;
    border: none;
    font-size: 0.95rem;
  }

  td {
    padding: 0.75rem 1rem;
    border: 1px solid #e0e0e0;
    color: var(--dark-bg);
    font-size: 0.9rem;
  }

  tbody tr:hover {
    background-color: #f5f5f5;
  }

  td img {
    width: 40px;
    height: 40px;
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .inputSection {
      padding: 1rem 0.75rem;
    }

    label {
      font-size: 0.95rem;
    }

    select {
      max-width: 100%;
      font-size: 1rem;
    }

    .ratingSection p {
      font-size: 1rem;
    }

    .ratingButtonContainer {
      gap: 0.5rem;
    }

    .ratingButtonContainer button {
      min-width: 45px;
      padding: 0.4rem;
    }

    .ratingButtonContainer img {
      width: 35px;
      height: 35px;
    }

    /* Card layout for tables on mobile */
    table,
    thead,
    tbody,
    th,
    td,
    tr {
      display: block;
      border: none;
    }

    table {
      margin-top: 1rem;
    }

    thead {
      display: none;
    }

    tr {
      background-color: white;
      margin-bottom: 1rem;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    td {
      padding: 0.75rem;
      border: none;
      padding-left: 40%;
      position: relative;
    }

    td::before {
      content: attr(data-label);
      position: absolute;
      left: 0.75rem;
      font-weight: 600;
      color: var(--frc-190-red);
      width: 35%;
    }

    td img {
      width: 35px;
      height: 35px;
    }
  }

  @media (max-width: 480px) {
    .inputSection {
      padding: 0.75rem;
      gap: 1rem;
    }

    label {
      font-size: 0.9rem;
    }

    .ratingButtonContainer {
      gap: 0.4rem;
    }

    .ratingButtonContainer button {
      min-width: 40px;
      padding: 0.3rem;
    }

    .ratingButtonContainer img {
      width: 30px;
      height: 30px;
    }

    td {
      padding: 0.5rem 0.5rem 0.5rem 40%;
      font-size: 0.85rem;
    }

    td::before {
      font-size: 0.8rem;
    }

    td img {
      width: 30px;
      height: 30px;
    }
  }
</style>
