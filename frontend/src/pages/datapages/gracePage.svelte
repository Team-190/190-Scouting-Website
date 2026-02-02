<script lang="ts">
  import { onMount } from "svelte";

  //Variables
  let allTeams = [];
  let rating = [" ","🤮","😨","🥱","🙂","🤑", "💍"];

  onMount(async () => {
    document.title = "GRACE - FRC 190";
    allTeams = await loadTeamNumbers();
    console.log(allTeams);
    populateTeamsDropdown();
  });

  async function loadTeamNumbers() {
    const data = await (
      await fetch("http://localhost:8000/teamNumbers")
    ).json();
    return data;
  }

  function populateTeamsDropdown() {
    const selectElement = document.getElementById("teams");

    allTeams.forEach((optionText) => {
      let option = document.createElement("option");
      console.log("Adding option: " + optionText);
      option.textContent = optionText;
      selectElement.appendChild(option);
    });

    const ratingSelectElement = document.getElementById("rating");
    rating.forEach((optionText) => {
      let option = document.createElement("option");
      console.log("Adding option: " + optionText);
      option.textContent = optionText;
      ratingSelectElement.appendChild(option);
    });
  }
</script>

<html lang="en">
  <body>
    <div class="inputSection">
      <form action="">
        <label for="teams">Choose a Team:</label>
        <select id="teams" name="teams">
          <option>Select a team</option>
        </select>
        <label for="rating">Rating</label>
        <select id="rating" name="rating">
          <option>Select a rating</option>
        </select>
        <input type="submit" value="Submit">
      </form>
      
    </div>
  </body>
</html>

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

  input[type="submit"] {
    cursor: pointer;
    padding: 8px 16px;
    border: 2px solid var(--frc-190-red);
    background: linear-gradient(135deg, #333 0%, #444 100%);
    color: white;
    font-weight: 600;
    border-radius: 6px;
    transition: all 0.2s;
  }

  input[type="submit"] :hover {
    background: linear-gradient(135deg, #444 0%, #555 100%);
    border-color: #e02200;
    transform: translateY(-1px);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
  }

  input[type="submit"] :active {
    transform: translateY(0);
  }

  input[type="submit"]:disabled {
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
</style>
