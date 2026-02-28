<script>
  import { goto } from "@mateothegreat/svelte5-router";
  import logo from "../images/frc190_Logo.png";
  import { onMount } from "svelte";
  import {
    fetchAlliancesAvailable,
    fetchElimsHaveStarted,
  } from "../utils/blueAllianceApi";

  let isMenuOpen = false;
  let alliancesAvailable = false;
  let elimsStarted = false;

  function toggleMenu() {
    isMenuOpen = !isMenuOpen;
  }

  function navigate(path) {
    goto(path);
    isMenuOpen = false;
  }

  async function checkAlliances() {
    const eventCode = localStorage.getItem("eventCode");
    alliancesAvailable = await fetchAlliancesAvailable(eventCode);
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
    // Re-check when the home page selects a new event (same-tab StorageEvent)
    window.addEventListener("storage", onStorageChange);
    // Also poll every 30s in case alliances get posted while the app is open
    const interval = setInterval(checkAlliances, 30000);
    return () => {
      window.removeEventListener("storage", onStorageChange);
      clearInterval(interval);
    };
  });
</script>

<nav class="navbar">
  <div class="nav-container">
    <div
      class="nav-brand"
      on:click={() => navigate("/")}
      on:keydown={(e) => e.key === "Enter" && navigate("/")}
      role="button"
      tabindex="0"
    >
      <img src={logo} alt="FRC 190 Logo" class="logo" />
      <span class="brand-text">Scouting App</span>
    </div>

    <button class="menu-toggle" on:click={toggleMenu} aria-label="Toggle menu">
      <span class="hamburger" class:open={isMenuOpen}></span>
    </button>

    <div class="nav-links" class:open={isMenuOpen}>
      <button on:click={() => navigate("/pickLists")}>Pick Lists</button>
      <button on:click={() => navigate("/singleMetric")}>Event View</button>
      <button on:click={() => navigate("/teamView")}>Team View</button>
      <button on:click={() => navigate("/pitScouting")}>Pit Scouting</button>
      <button on:click={() => navigate("/gracePage")}>Grace Page</button>
      <button on:click={() => navigate("/matchPreview")}>Match Preview</button>
      <button on:click={() => navigate("/qualPage")}
        >Qualitative Scouting</button
      >

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
              Gompei Madness
            </button>
          {:else}
            <button on:click={() => navigate("/marchMadness")}>
              Gompei Madness
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
    width: 100%;
    box-sizing: border-box;
    z-index: 1000;
    background-color: #333;
    color: white;
    padding: 1rem;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
    overflow: visible;
  }

  .nav-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 0 auto;
    width: 100%;
    position: relative;
  }

  .nav-brand {
    font-size: 1.5rem;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .logo {
    height: 40px;
    width: auto;
  }

  .nav-links {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .menu-toggle {
    display: none;
    background: none;
    border: none;
    cursor: pointer;
    padding: 1rem;
    z-index: 1001;
  }

  .hamburger {
    display: block;
    width: 24px;
    height: 2px;
    background: white;
    position: relative;
    transition: background 0.2s;
  }

  .hamburger::before,
  .hamburger::after {
    content: "";
    position: absolute;
    width: 24px;
    height: 2px;
    background: white;
    transition: transform 0.2s;
  }

  .hamburger::before {
    top: -8px;
  }
  .hamburger::after {
    bottom: -8px;
  }

  .hamburger.open {
    background: transparent;
  }
  .hamburger.open::before {
    transform: translateY(8px) rotate(45deg);
  }
  .hamburger.open::after {
    transform: translateY(-8px) rotate(-45deg);
  }

  button:not(.menu-toggle):not(.madness-btn) {
    background: none;
    border: none;
    color: white;
    font-size: 1rem;
    cursor: pointer;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    transition: background-color 0.2s;
    white-space: nowrap;
  }

  button:not(.menu-toggle):not(.madness-btn):hover {
    background-color: #555;
  }

  /* ── Madness wrapper ── */
  .madness-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    animation: dropIn 0.8s cubic-bezier(0.22, 1.8, 0.36, 1) both;
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

  /* ── Screen flash overlay ── */
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

  /* ── Shockwave rings ── */
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

  .sparkle:nth-child(1) {
    top: -5%;
    left: 50%;
  }
  .sparkle:nth-child(2) {
    top: 5%;
    left: 82%;
  }
  .sparkle:nth-child(3) {
    top: 50%;
    left: 108%;
  }
  .sparkle:nth-child(4) {
    top: 95%;
    left: 82%;
  }
  .sparkle:nth-child(5) {
    top: 105%;
    left: 50%;
  }
  .sparkle:nth-child(6) {
    top: 95%;
    left: 18%;
  }
  .sparkle:nth-child(7) {
    top: 50%;
    left: -8%;
  }
  .sparkle:nth-child(8) {
    top: 5%;
    left: 18%;
  }
  .sparkle:nth-child(9) {
    top: -10%;
    left: 30%;
  }
  .sparkle:nth-child(10) {
    top: -10%;
    left: 70%;
  }
  .sparkle:nth-child(11) {
    top: 110%;
    left: 30%;
  }
  .sparkle:nth-child(12) {
    top: 110%;
    left: 70%;
  }

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
    padding: 0.5rem 1.1rem;
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
  }

  .madness-btn:hover {
    transform: scale(1.1) rotate(-1deg);
    box-shadow:
      0 0 20px 6px rgba(255, 215, 0, 1),
      0 0 40px 12px rgba(255, 165, 0, 0.7),
      inset 0 1px 1px rgba(255, 255, 255, 0.5);
  }

  @keyframes goldShimmer {
    0% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
    100% {
      background-position: 0% 50%;
    }
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
    0%,
    85%,
    100% {
      transform: rotate(0deg) scale(1);
    }
    87% {
      transform: rotate(-5deg) scale(1.08);
    }
    89% {
      transform: rotate(5deg) scale(1.08);
    }
    91% {
      transform: rotate(-4deg) scale(1.06);
    }
    93% {
      transform: rotate(4deg) scale(1.06);
    }
    95% {
      transform: rotate(-2deg) scale(1.03);
    }
    97% {
      transform: rotate(2deg) scale(1.02);
    }
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
    0% {
      left: -75%;
    }
    55% {
      left: 125%;
    }
    100% {
      left: 125%;
    }
  }

  /* ── Responsive ── */
  @media (max-width: 1000px) {
    .brand-text {
      font-size: 1.2rem;
    }

    .menu-toggle {
      display: block;
    }

    .nav-links {
      display: none;
      position: absolute;
      top: 100%;
      right: -1rem;
      width: 200px;
      background-color: #333;
      flex-direction: column;
      padding: 1rem;
      box-shadow: -2px 5px 5px rgba(0, 0, 0, 0.2);
      border-bottom-left-radius: 8px;
    }

    .nav-links.open {
      display: flex;
    }

    button:not(.menu-toggle):not(.madness-btn) {
      text-align: right;
      width: 100%;
      padding: 0.75rem;
    }

    .madness-btn {
      width: 100%;
      text-align: center;
    }
  }
</style>
