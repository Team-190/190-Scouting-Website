<script>
  import { goto } from "@mateothegreat/svelte5-router";
  import { onMount } from "svelte";
  import logo from "../images/frc190_Logo.png";
  import { isSidebarOpen } from "../stores/sidebarState.js";
  import { fetchAlliances, fetchElimsHaveStarted } from "../utils/api.js";

  let alliancesAvailable = false;
  let elimsStarted = false;
  let expandedMenu = null;
  let isHovering = false;
  let isPinnedOpen = false;
  let isMobile = false;

  function syncViewportMode() {
    if (typeof window === "undefined") return;
    isMobile = window.innerWidth <= 768;
    if (isMobile) {
      isHovering = false;
      isPinnedOpen = false;
      isSidebarOpen.set(false);
    }
  }

  function toggleSidebar() {
    if (isMobile) {
      const nextOpen = !$isSidebarOpen;
      isPinnedOpen = false;
      isHovering = false;
      isSidebarOpen.set(nextOpen);
      return;
    }

    if (isPinnedOpen) {
      // Currently pinned open, close it
      isPinnedOpen = false;
      isSidebarOpen.set(false);
    } else {
      // Currently closed, pin it open
      isPinnedOpen = true;
      isSidebarOpen.set(true);
    }
  }

  function navigate(path) {
    // Always hide navbar when clicking a link
    expandedMenu = null;
    isPinnedOpen = false;
    isHovering = false;
    isSidebarOpen.set(false);
    goto(path);
  }

  function handleMouseEnter() {
    if (isMobile) return;
    isHovering = true;
    isSidebarOpen.set(true);
  }

  function handleMouseLeave() {
    if (isMobile) return;
    isHovering = false;
    if (!isPinnedOpen) {
      isSidebarOpen.set(false);
    }
  }

  function toggleMenu(menuName) {
    expandedMenu = expandedMenu === menuName ? null : menuName;
  }

  async function checkAlliances() {
    const eventCode = localStorage.getItem("eventCode");
    if (!eventCode) {
      alliancesAvailable = false;
      elimsStarted = false;
      return;
    }

    try {
      const alliancesData = await fetchAlliances(eventCode);
      alliancesAvailable = Boolean(alliancesData?.available);
      elimsStarted = await fetchElimsHaveStarted(eventCode);
    } catch {
      alliancesAvailable = false;
      elimsStarted = false;
    }
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
    syncViewportMode();
    checkAlliances();
    window.addEventListener("storage", onStorageChange);
    window.addEventListener("resize", syncViewportMode);
    const interval = setInterval(checkAlliances, 30000);
    return () => {
      window.removeEventListener("storage", onStorageChange);
      window.removeEventListener("resize", syncViewportMode);
      clearInterval(interval);
    };
  });
</script>

<nav
  class="navbar"
  class:collapsed={!$isSidebarOpen && !isHovering}
  class:mobile={isMobile}
  on:mouseenter={handleMouseEnter}
  on:mouseleave={handleMouseLeave}
>
  <button
    class="toggle-btn"
    on:click={toggleSidebar}
    aria-label="Toggle sidebar"
  >
    <span class="toggle-icon" class:rotated={$isSidebarOpen}></span>
  </button>

  <div class="sidebar-content">
    <div
      class="logo-section"
      on:click={() => navigate("/")}
      role="button"
      tabindex="0"
      on:keydown={(e) => e.key === "Enter" && navigate("/")}
    >
      <img src={logo} alt="FRC 190 Logo" class="logo" />
    </div>

    <div class="nav-links" class:disabled={!($isSidebarOpen || isHovering)}>
      <!-- Data Collection Dropdown -->
      <div class="dropdown" class:disabled={!($isSidebarOpen || isHovering)}>
        <button
          class="dropdown-toggle"
          on:click={() => toggleMenu("dataCollection")}
          disabled={!($isSidebarOpen || isHovering)}
        >
          <span class="label">Data Collection</span>
          <span
            class="dropdown-arrow"
            class:expanded={expandedMenu === "dataCollection"}>▼</span
          >
        </button>
        {#if expandedMenu === "dataCollection"}
          <div class="dropdown-menu">
            <button
              on:click={() => navigate("/pitScouting")}
              class="dropdown-item"
            >
              Pit Scouting
            </button>
            <button
              on:click={() => navigate("/qualPage")}
              class="dropdown-item"
            >
              Qual Scouting
            </button>
          </div>
        {/if}
      </div>

      <!-- Ratings Dropdown -->
      <div class="dropdown" class:disabled={!($isSidebarOpen || isHovering)}>
        <button
          class="dropdown-toggle"
          on:click={() => toggleMenu("ratings")}
          disabled={!($isSidebarOpen || isHovering)}
        >
          <span class="label">Ratings</span>
          <span
            class="dropdown-arrow"
            class:expanded={expandedMenu === "ratings"}>▼</span
          >
        </button>
        {#if expandedMenu === "ratings"}
          <div class="dropdown-menu">
            <button
              on:click={() => navigate("/gracePage")}
              class="dropdown-item"
            >
              Grace Page
            </button>
            <button
              on:click={() => navigate("/ananthPage")}
              class="dropdown-item"
            >
              Ananth Page
            </button>
          </div>
        {/if}
      </div>

      <!-- View Data Dropdown -->
      <div class="dropdown" class:disabled={!($isSidebarOpen || isHovering)}>
        <button
          class="dropdown-toggle"
          on:click={() => toggleMenu("viewData")}
          disabled={!($isSidebarOpen || isHovering)}
        >
          <span class="label">View Data</span>
          <span
            class="dropdown-arrow"
            class:expanded={expandedMenu === "viewData"}>▼</span
          >
        </button>
        {#if expandedMenu === "viewData"}
          <div class="dropdown-menu">
            <button
              on:click={() => navigate("/singleMetric")}
              class="dropdown-item"
            >
              Event View
            </button>
            <button
              on:click={() => navigate("/teamView")}
              class="dropdown-item"
            >
              Team View
            </button>
            <button
              on:click={() => navigate("/matchPreview")}
              class="dropdown-item"
            >
              Match Preview
            </button>
            <button
              on:click={() => navigate("/qualDataView")}
              class="dropdown-item"
            >
              Qualitative Data
            </button>
          </div>
        {/if}
      </div>

      <button
        on:click={() => navigate("/pickLists")}
        disabled={!($isSidebarOpen || isHovering)}
      >
        <span class="label">Pick Lists</span>
      </button>

      <div class="bottom-actions">
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
            <button
              class="madness-btn"
              on:click={() => navigate("/marchMadness")}
            >
              <span>Gompei Madness</span>
            </button>
          {/if}

        </div>
      {/if}

      <button
        class="info-btn"
        on:click={() => navigate("/info")}
        disabled={!($isSidebarOpen || isHovering)}
      >
        <span class="label">Info Page</span>
      </button>

      <button
        class="info-btn debug-btn"
        on:click={() => navigate("/debug")}
        disabled={!($isSidebarOpen || isHovering)}
      >
        <span class="label">Debug Page</span>
      </button>
    </div>
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
    left: 0;
    margin: 0 auto;
  }

  .toggle-icon::before,
  .toggle-icon::after {
    content: "";
    position: absolute;
    left: 0;
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

   .info-btn {
    width: calc(100% - 2rem);
    margin: 0.25rem 1rem 0;
    border: 2px solid #c81b00;
    border-radius: 6px;
    background: linear-gradient(135deg, #262626 0%, #383838 100%);
    color: #fff;
    font-size: 0.95rem;
    font-weight: 700;
    padding: 0.55rem 0.75rem;
    justify-content: center;
    text-align: center;
  }

  .info-btn:not(:disabled):hover {
    background: linear-gradient(135deg, #333 0%, #444 100%);
    border-color: #e02200;
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
    width: 100%;
  }

  .logo-section:hover {
    background-color: #555;
  }

  .logo-section:active {
    background-color: #666;
  }

  .navbar.collapsed .logo-section {
    padding: 1rem 0;
  }

  .logo {
    width: 80px;
    height: 40px;
    max-width: none;
    object-fit: contain;
    flex-shrink: 0;
    display: block;
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
    transition:
      background-color 0.2s,
      opacity 0.2s;
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
    opacity: 0.75;
  }

  .navbar.collapsed .nav-links button {
    color: #777;
  }

  /* ── Dropdown styles ── */
  .dropdown {
    position: relative;
  }

  .navbar.collapsed .dropdown-menu {
    display: none;
  }

  .dropdown-toggle {
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    padding: 1rem;
    transition:
      background-color 0.2s,
      opacity 0.2s;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 1rem;
    white-space: nowrap;
    text-align: left;
    font-family: inherit;
    min-width: 0;
    width: 100%;
  }

  .dropdown-toggle:hover {
    background-color: #555;
  }

  .dropdown-toggle:active {
    background-color: #666;
  }

  .dropdown-toggle:disabled {
    cursor: not-allowed;
    pointer-events: none;
  }

  .dropdown-arrow {
    flex-shrink: 0;
    transition: transform 0.2s;
    font-size: 0.75rem;
    margin-left: auto;
  }

  .dropdown-arrow.expanded {
    transform: rotate(180deg);
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background-color: #222;
    border-left: 3px solid #c81b00;
    padding: 0;
    margin: 0;
    animation: slideDown 0.2s ease-out;
    z-index: 1001;
    min-width: 100%;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown-item {
    background: none;
    border: none;
    color: #ccc;
    cursor: pointer;
    padding: 0.75rem 1rem 0.75rem 2rem;
    width: 100%;
    text-align: left;
    font-size: 0.95rem;
    font-family: inherit;
    transition: all 0.2s;
    display: block;
  }

  .dropdown-item:hover {
    background-color: #444;
    color: white;
    padding-left: 2.5rem;
  }

  .dropdown-item:active {
    background-color: #555;
  }

  .dropdown.disabled {
    opacity: 0.5;
  }

  .bottom-actions {
    margin-top: auto;
    padding: 0.5rem 0 1rem;
  }

  .navbar.collapsed .bottom-actions {
    display: none;
  }

  /* ── Madness wrapper ── */
  .madness-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
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

  .info-btn {
    width: calc(100% - 2rem);
    margin: 0.25rem 1rem 0;
    border: 2px solid #c81b00;
    border-radius: 6px;
    background: linear-gradient(135deg, #262626 0%, #383838 100%);
    color: #fff;
    font-size: 0.95rem;
    font-weight: 700;
    padding: 0.55rem 0.75rem;
    justify-content: center;
    text-align: center;
  }

  .info-btn:not(:disabled):hover {
    background: linear-gradient(135deg, #333 0%, #444 100%);
    border-color: #e02200;
  }

  .debug-btn {
    margin-top: 0.45rem;
    border-color: #0c6da4;
    background: linear-gradient(135deg, #1e2f3f 0%, #263f57 100%);
  }

  .debug-btn:not(:disabled):hover {
    border-color: #2a92c7;
    background: linear-gradient(135deg, #28445a 0%, #335975 100%);
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

 @media (max-width: 768px) {
  .navbar {
    position: relative;
    width: 56px;
    height: 56px; /* collapsed: only take up a strip, not full viewport height */
    transition: none;
    box-shadow: none;
    z-index: 1000;
  }

  .navbar.mobile:not(.collapsed) {
    position: absolute;
    width: min(82vw, 320px);
    height: 100vh;
    top: 0;
    left: 0;
    box-shadow: 2px 0 10px rgba(0, 0, 0, 0.35);
    transition: width 1s, height 1s;
  }

    .toggle-btn {
      background: rgba(0, 0, 0, 0.25);
      border-radius: 8px;
      padding: 0.55rem;
    }

    .sidebar-content {
      margin-top: 2.9rem;
      overflow-y: auto;
    }

    .logo {
      width: 64px;
      height: 32px;
    }

    .nav-links button,
    .dropdown-toggle {
      padding: 0.85rem 0.9rem;
      font-size: 0.95rem;
    }

    .dropdown-item {
      padding: 0.65rem 0.9rem 0.65rem 1.4rem;
    }
  }
</style>
