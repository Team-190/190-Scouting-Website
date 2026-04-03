<script>
  import { goto } from "@mateothegreat/svelte5-router";
  import { onMount } from "svelte";
  import logo from "../images/frc190_Logo.png";
  import { isSidebarOpen } from "../stores/sidebarState.js";
  import {
      fetchAlliances,
      fetchElimsHaveStarted,
  } from "../utils/api.js";

  let alliancesAvailable = false;
  let elimsStarted = false;

  function toggleSidebar() {
    isSidebarOpen.update((val) => !val);
  }

  function navigate(path) {
    goto(path);
    isSidebarOpen.set(false);
  }

  async function checkAlliances() {
    const eventCode = localStorage.getItem("eventCode");
    alliancesAvailable = await fetchAlliances(eventCode);
    elimsStarted = await fetchElimsHaveStarted(eventCode);
  }

  function onStorageChange(e) {
    if (e.key === "eventCode" && e.newValue) {
      checkAlliances();
    }
    if (e.key === "elimsStarted") {
      elimsStarted = e.newValue === "1";
    }
  }

  onMount(() => {
    checkAlliances();
    window.addEventListener("storage", onStorageChange);
    const interval = setInterval(checkAlliances, 30000);
    return () => {
      window.removeEventListener("storage", onStorageChange);
      clearInterval(interval);
    };
  });
</script>

<nav class="navbar" class:collapsed={!$isSidebarOpen}>
  <button class="toggle-btn" on:click={toggleSidebar} aria-label="Toggle sidebar">
    <span class="toggle-icon" class:rotated={$isSidebarOpen}></span>
  </button>

  <div class="sidebar-content">
    <div class="logo-section" on:click={() => navigate("/")} role="button" tabindex="0" on:keydown={(e) => e.key === "Enter" && navigate("/")}>
      <img src={logo} alt="FRC 190 Logo" class="logo" />
    </div>

    <div class="nav-links" class:disabled={!$isSidebarOpen}>
      <button on:click={() => navigate("/pickLists")} disabled={!$isSidebarOpen}>
        <span class="label">Pick Lists</span>
      </button>
      <button on:click={() => navigate("/singleMetric")} disabled={!$isSidebarOpen}>
        <span class="label">Event View</span>
      </button>
      <button on:click={() => navigate("/teamView")} disabled={!$isSidebarOpen}>
        <span class="label">Team View</span>
      </button>
      <button on:click={() => navigate("/pitScouting")} disabled={!$isSidebarOpen}>
        <span class="label">Pit Scouting</span>
      </button>
      <button on:click={() => navigate("/gracePage")} disabled={!$isSidebarOpen}>
        <span class="label">Grace Page</span>
      </button>
      <button on:click={() => navigate("/ananthPage")} disabled={!$isSidebarOpen}>
        <span class="label">Ananth Page</span>
      </button>
      <button on:click={() => navigate("/matchPreview")} disabled={!$isSidebarOpen}>
        <span class="label">Match Preview</span>
      </button>
      <button on:click={() => navigate("/qualPage")} disabled={!$isSidebarOpen}>
        <span class="label">Qual Scouting</span>
      </button>
      <button on:click={() => navigate("/qualDataView")} disabled={!$isSidebarOpen}>
        <span class="label">Qual Data View (sigma)</span>
      </button>

      {#if alliancesAvailable}
        <div class="madness-wrapper">
          {#if !elimsStarted}
            <!-- 5 expanding shockwave rings -->
            {#each Array(5) as _, i}
              <div class="shockwave" style="--ri: {i}"></div>
            {/each}

            <!-- Smoke puffs -->
            {#each Array(10) as _, i}
              <div class="smoke-puff" style="--si: {i}"></div>
            {/each}

            <!-- Confetti burst -->
            {#each Array(28) as _, i}
              <div class="confetti" style="--ci: {i}">
                {#if i % 6 === 0}★{:else if i % 6 === 1}●{:else if i % 6 === 2}■{:else if i % 6 === 3}♦{:else if i % 6 === 4}🏆{:else}⚡{/if}
              </div>
            {/each}

            <!-- Orbiting stars -->
            {#each Array(4) as _, i}
              <div class="orbit-ring" style="--oi: {i}">
                <div class="orbit-star">⭐</div>
              </div>
            {/each}

            <!-- Lightning bolts -->
            {#each Array(6) as _, i}
              <div class="lightning" style="--li: {i}">⚡</div>
            {/each}

            <!-- Sparkles -->
            <div class="sparkle-container">
              {#each Array(12) as _, i}
                <div class="sparkle" style="--i: {i}">✦</div>
              {/each}
            </div>

            <!-- Screen flash overlay -->
            <div class="flash-overlay"></div>

            <button
              class="madness-btn"
              on:click={() => navigate("/marchMadness")}
            >
              <span class="madness-shine"></span>
              <span class="madness-shine madness-shine-2"></span>
              <span>Gompei Madness</span>
            </button>
          {:else}
            <button class="madness-btn" on:click={() => navigate("/marchMadness")}>
              <span>Gompei Madness</span>
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</nav>

<style>
  .navbar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    width: 250px;
    background-color: #333;
    color: white;
    box-shadow: 2px 0 5px rgba(0, 0, 0, 0.2);
    transition: width 0.3s ease;
    display: flex;
    flex-direction: column;
    z-index: 1000;
    overflow: hidden;
  }

  .navbar.collapsed {
    width: 80px;
  }

  .toggle-btn {
    position: absolute;
    top: 1rem;
    left: 1rem;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.5rem;
    z-index: 1001;
    display: flex;
    align-items: center;
    justify-content: center;
    outline: none;
  }

  .toggle-btn:focus {
    outline: none;
  }

  .toggle-btn:active {
    outline: none;
  }

  .toggle-icon {
    display: block;
    width: 20px;
    height: 2px;
    background: white;
    position: relative;
    transition: transform 0.3s ease;
  }

  .toggle-icon::before,
  .toggle-icon::after {
    content: "";
    position: absolute;
    width: 20px;
    height: 2px;
    background: white;
    transition: transform 0.3s ease;
  }

  .toggle-icon::before {
    top: -6px;
  }
  .toggle-icon::after {
    bottom: -6px;
  }

  .toggle-icon.rotated {
    background: white;
  }
  .toggle-icon.rotated::before {
    transform: none;
  }
  .toggle-icon.rotated::after {
    transform: none;
  }

  .sidebar-content {
    display: flex;
    flex-direction: column;
    padding: 1rem 0;
    margin-top: 2rem;
    flex: 1;
    overflow: hidden;
  }

  .logo-section {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    flex-direction: column;
    gap: 0.5rem;
    border-bottom: 1px solid #555;
    margin-bottom: 1rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .logo-section:hover {
    background-color: #555;
  }

  .logo-section:active {
    background-color: #666;
  }

  .logo {
    height: 40px;
    width: auto;
  }

  .logo-text {
    text-align: center;
    transition: opacity 0.3s ease;
  }

  .brand-text {
    font-size: 1.2rem;
    font-weight: bold;
    line-height: 1.2;
  }

  .brand-subtext {
    font-size: 0.9rem;
    color: #aaa;
  }

  .nav-links {
    display: flex;
    flex-direction: column;
    gap: 0;
    flex: 1;
  }

  .nav-links button {
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    padding: 1rem;
    transition: background-color 0.2s, opacity 0.2s;
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 1rem;
    white-space: nowrap;
    text-align: left;
    font-family: inherit;
    min-width: 0;
  }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 1;
    min-width: 0;
  }

  .nav-links button:hover {
    background-color: #555;
  }

  .nav-links button:active {
    background-color: #666;
  }

  .nav-links button:disabled {
    cursor: not-allowed;
    pointer-events: none;
  }

  .navbar.collapsed .nav-links button {
    color: #777;
  }

  /* ── Madness wrapper ── */
  .madness-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    margin-top: auto;
    animation: dropIn 0.8s cubic-bezier(0.22, 1.8, 0.36, 1) both;
  }

  .navbar.collapsed .madness-wrapper {
    display: none;
  }

  @keyframes dropIn {
    0% {
      transform: translateY(-200px) scaleX(0.2) rotate(-15deg);
      opacity: 0;
      filter: blur(8px);
    }
    50% {
      filter: blur(0px);
    }
    60% {
      transform: translateY(12px) scaleX(1.12) rotate(3deg);
      opacity: 1;
    }
    75% {
      transform: translateY(-6px) scaleX(0.95) rotate(-2deg);
    }
    88% {
      transform: translateY(3px) scaleX(1.03) rotate(1deg);
    }
    100% {
      transform: translateY(0) scaleX(1) rotate(0deg);
      opacity: 1;
    }
  }

  .flash-overlay {
    position: fixed;
    inset: 0;
    background: white;
    pointer-events: none;
    z-index: 9999;
    animation: screenFlash 0.5s ease-out 0.05s both;
  }

  @keyframes screenFlash {
    0% {
      opacity: 0.7;
    }
    100% {
      opacity: 0;
    }
  }
  
  .shockwave {
    position: absolute;
    inset: -4px;
    border-radius: 10px;
    border: 3px solid gold;
    pointer-events: none;
    z-index: 0;
    animation: shockwaveExpand 1.4s ease-out calc(0.2s + var(--ri, 0) * 0.18s)
      both;
    border-color: hsl(calc(30 + var(--ri, 0) * 18deg), 100%, 55%);
    opacity: 0;
  }

  @keyframes shockwaveExpand {
    0% {
      transform: scale(1);
      opacity: 1;
    }
    100% {
      transform: scale(5);
      opacity: 0;
    }
  }

  /* ── Smoke puffs ── */
  .smoke-puff {
    position: absolute;
    bottom: -2px;
    left: calc(10% + var(--si) * 9%);
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      rgba(220, 220, 220, 0.85) 0%,
      transparent 70%
    );
    pointer-events: none;
    z-index: 3;
    animation: smokeDrift calc(1.3s + var(--si) * 0.12s) ease-out
      calc(var(--si) * 0.07s) both;
  }

  @keyframes smokeDrift {
    0% {
      transform: scale(0.2) translateY(0) translateX(0);
      opacity: 1;
    }
    30% {
      transform: scale(1.4) translateY(-14px)
        translateX(calc((var(--si) - 5) * 4px));
      opacity: 0.7;
    }
    100% {
      transform: scale(3.5) translateY(-60px)
        translateX(calc((var(--si) - 5) * 12px));
      opacity: 0;
    }
  }

  /* ── Confetti burst ── */
  .confetti {
    position: absolute;
    top: 50%;
    left: 50%;
    font-size: 13px;
    pointer-events: none;
    z-index: 4;
    animation: confettiBurst calc(1.1s + var(--ci) * 0.03s) ease-out
      calc(0.05s + var(--ci) * 0.02s) both;
    color: hsl(calc(var(--ci) * 13deg), 100%, 58%);
    text-shadow: 0 0 5px currentColor;
  }

  @keyframes confettiBurst {
    0% {
      transform: translate(-50%, -50%) rotate(0deg) scale(2);
      opacity: 1;
    }
    100% {
      transform: translate(
          calc(
            -50% + (cos(calc(var(--ci) * 12.86deg)) * (55px + var(--ci) * 3px))
          ),
          calc(
            -50% + (sin(calc(var(--ci) * 12.86deg)) * (55px + var(--ci) * 3px))
          )
        )
        rotate(900deg) scale(0.1);
      opacity: 0;
    }
  }

  /* ── Orbiting stars ── */
  .orbit-ring {
    position: absolute;
    inset: -20px;
    border-radius: 50%;
    pointer-events: none;
    animation: orbitSpin calc(2.5s + var(--oi) * 0.7s) linear
      calc(var(--oi) * 0.4s) infinite;
    z-index: 2;
    transform-origin: center;
  }

  @keyframes orbitSpin {
    from {
      transform: rotate(calc(var(--oi) * 90deg));
    }
    to {
      transform: rotate(calc(var(--oi) * 90deg + 360deg));
    }
  }

  .orbit-star {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    font-size: calc(10px + var(--oi) * 2px);
    filter: drop-shadow(0 0 4px gold);
    animation: counterSpin calc(2.5s + var(--oi) * 0.7s) linear
      calc(var(--oi) * 0.4s) infinite;
  }

  @keyframes counterSpin {
    from {
      transform: translateX(-50%) rotate(0deg);
    }
    to {
      transform: translateX(-50%) rotate(-360deg);
    }
  }

  /* ── Lightning bolts ── */
  .lightning {
    position: absolute;
    top: 50%;
    left: 50%;
    font-size: 18px;
    pointer-events: none;
    z-index: 5;
    animation: lightningStrike 0.6s ease-out calc(0.1s + var(--li) * 0.12s) both;
    color: #ffe066;
    text-shadow:
      0 0 10px #fff,
      0 0 20px #ffd700,
      0 0 40px #ff8800;
    transform-origin: center;
  }

  @keyframes lightningStrike {
    0% {
      transform: translate(
          calc(-50% + cos(calc(var(--li) * 60deg)) * 5px),
          calc(-50% + sin(calc(var(--li) * 60deg)) * 5px)
        )
        scale(3) rotate(calc(var(--li) * 30deg));
      opacity: 1;
    }
    40% {
      opacity: 0.9;
    }
    100% {
      transform: translate(
          calc(-50% + cos(calc(var(--li) * 60deg)) * 70px),
          calc(-50% + sin(calc(var(--li) * 60deg)) * 70px)
        )
        scale(0.3) rotate(calc(var(--li) * 60deg + 180deg));
      opacity: 0;
    }
  }

  /* ── Sparkles ── */
  .sparkle-container {
    position: absolute;
    inset: -16px;
    pointer-events: none;
    z-index: 2;
  }

  .sparkle {
    position: absolute;
    font-size: 14px;
    color: gold;
    text-shadow:
      0 0 6px gold,
      0 0 14px #ffd700,
      0 0 22px orange;
    animation: sparklePop calc(1s + var(--i) * 0.16s) ease-in-out
      calc(var(--i) * 0.1s) infinite;
    transform: translate(-50%, -50%);
  }

  .sparkle:nth-child(1) { top: -5%;  left: 50%;  }
  .sparkle:nth-child(2) { top: 5%;   left: 82%;  }
  .sparkle:nth-child(3) { top: 50%;  left: 108%; }
  .sparkle:nth-child(4) { top: 95%;  left: 82%;  }
  .sparkle:nth-child(5) { top: 105%; left: 50%;  }
  .sparkle:nth-child(6) { top: 95%;  left: 18%;  }
  .sparkle:nth-child(7) { top: 50%;  left: -8%;  }
  .sparkle:nth-child(8) { top: 5%;   left: 18%;  }
  .sparkle:nth-child(9) { top: -10%; left: 30%;  }
  .sparkle:nth-child(10){ top: -10%; left: 70%;  }
  .sparkle:nth-child(11){ top: 110%; left: 30%;  }
  .sparkle:nth-child(12){ top: 110%; left: 70%;  }

  @keyframes sparklePop {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.3) rotate(0deg);
    }
    35% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1.5) rotate(60deg);
    }
    65% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1.1) rotate(90deg);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.3) rotate(180deg);
    }
  }

  /* ── Madness button ── */
  .madness-btn {
    position: relative;
    overflow: hidden;
    background: linear-gradient(
      135deg,
      #b8860b 0%,
      #ffd700 30%,
      #fffacd 50%,
      #ffd700 70%,
      #b8860b 100%
    );
    background-size: 300% 300%;
    border: 2px solid #ffd700;
    color: #3a2000;
    font-size: 0.95rem;
    font-weight: 900;
    cursor: pointer;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    white-space: nowrap;
    letter-spacing: 0.5px;
    text-shadow: 0 1px 2px rgba(255, 255, 255, 0.5);
    animation:
      goldShimmer 1.8s linear infinite,
      glowPulse 1.2s ease-in-out infinite alternate,
      btnWiggle 3.5s ease-in-out 1.5s infinite;
    transition:
      transform 0.15s,
      box-shadow 0.15s;
    z-index: 1;
    text-align: center;
  }

  .madness-btn:disabled {
    cursor: not-allowed;
    opacity: 0;
    pointer-events: none;
    animation: none;
  }

  .madness-btn:not(:disabled):hover {
    transform: scale(1.1) rotate(-1deg);
    box-shadow:
      0 0 20px 6px rgba(255, 215, 0, 1),
      0 0 40px 12px rgba(255, 165, 0, 0.7),
      inset 0 1px 1px rgba(255, 255, 255, 0.5);
  }

  @keyframes goldShimmer {
    0%   { background-position: 0%   50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0%   50%; }
  }

  @keyframes glowPulse {
    from {
      box-shadow:
        0 0 6px 2px rgba(255, 215, 0, 0.6),
        0 0 16px 3px rgba(255, 165, 0, 0.3);
    }
    to {
      box-shadow:
        0 0 18px 7px rgba(255, 215, 0, 1),
        0 0 36px 12px rgba(255, 165, 0, 0.7),
        0 0 60px 20px rgba(255, 100, 0, 0.3);
    }
  }

  @keyframes btnWiggle {
    0%,  85%, 100% { transform: rotate(0deg)  scale(1);    }
    87%            { transform: rotate(-5deg) scale(1.08); }
    89%            { transform: rotate(5deg)  scale(1.08); }
    91%            { transform: rotate(-4deg) scale(1.06); }
    93%            { transform: rotate(4deg)  scale(1.06); }
    95%            { transform: rotate(-2deg) scale(1.03); }
    97%            { transform: rotate(2deg)  scale(1.02); }
  }

  /* Double shine sweep */
  .madness-shine {
    position: absolute;
    top: 0;
    left: -75%;
    width: 50%;
    height: 100%;
    background: linear-gradient(
      120deg,
      transparent 0%,
      rgba(255, 255, 255, 0.65) 50%,
      transparent 100%
    );
    animation: shineSweep 1.8s ease-in-out infinite;
    pointer-events: none;
  }

  .madness-shine-2 {
    animation-delay: 0.9s;
    opacity: 0.6;
  }

  @keyframes shineSweep {
    0%   { left: -75%;  }
    55%  { left: 125%;  }
    100% { left: 125%;  }
  }
</style>
