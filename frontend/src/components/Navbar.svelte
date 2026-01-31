<script>
    import { goto } from '@mateothegreat/svelte5-router';
    import logo from '../images/frc190_Logo.png';
</script>

<nav class="navbar">
    <div class="nav-brand" on:click={() => goto('/')}>
        <img src={logo} alt="FRC 190 Logo" class="logo" />
        Scouting App
    </div>
    
    <div class="nav-links">
        <button on:click={() => goto('/pickLists')}>Pick Lists</button>
        <button on:click={() => goto('/eventView')}>Event View</button>
        <button on:click={() => goto('/teamView')}>Team View</button>
        <button on:click={() => goto('/graph')}>Graph Page</button>
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
        display: flex;
        justify-content: space-between;
        align-items: center;
        background-color: #333;
        color: white;
        padding: 1rem;
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

    button {
        background: none;
        border: none;
        color: white;
        font-size: 1rem;
        cursor: pointer;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        transition: background-color 0.2s;
    }

    button:hover {
        background-color: #555;
    }
</style>
