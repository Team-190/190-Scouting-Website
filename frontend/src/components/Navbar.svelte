<script>
    import { goto } from "@mateothegreat/svelte5-router";
    import logo from "../images/frc190_Logo.png";

    let isMenuOpen = false;

    function toggleMenu() {
        isMenuOpen = !isMenuOpen;
    }

    function navigate(path) {
        goto(path);
        isMenuOpen = false;
    }
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

        <button
            class="menu-toggle"
            on:click={toggleMenu}
            aria-label="Toggle menu"
        >
            <span class="hamburger" class:open={isMenuOpen}></span>
        </button>

        <div class="nav-links" class:open={isMenuOpen}>
            <button on:click={() => navigate("/pickLists")}>Pick Lists</button>
            <button on:click={() => navigate("/singleMetric")}
                >Event View</button
            >
            <button on:click={() => navigate("/teamView")}>Team View</button>
            <button on:click={() => navigate("/pitScouting")}
                >Pit Scouting</button
            >
            <button on:click={() => navigate("/gracePage")}>Grace Page</button>
            <button on:click={() => navigate("/marchMadness")}
                >Gompei Madness</button
            >
            <button on:click={() => navigate("/matchPreview")}
                >Match Preview</button
            >
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

    button:not(.menu-toggle) {
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

    button:not(.menu-toggle):hover {
        background-color: #555;
    }

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

        button:not(.menu-toggle) {
            text-align: right;
            width: 100%;
            padding: 0.75rem;
        }
    }
</style>
