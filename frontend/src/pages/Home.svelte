<script>
    import { goto } from '@mateothegreat/svelte5-router';

    function cacheData() {
        console.log("CACHE DATA triggered");
        // Placeholder for future cache logic
    }
</script>

<div class="container">
    <div class="button-wrapper" on:click={cacheAllData}>
        <!-- Nonagon (9-sided) -->
        <div class="nonagon">
            <!-- Hexagon (6-sided) -->
            <div class="hexagon">
                <span class="label">CACHE DATA</span>
            </div>
        </div>
    </div>
</div>

<button class="fab" on:click={() => goto('/event-select')}>
    Select Event
</button>

<style>
    /* FRC 190 Brand Colors */
    :root {
        --frc-190-red: #C81B00;
        --wpi-gray: #A9B0B7;
        --frc-190-black: #4D4D4D;
    }

    .container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        background: var(--wpi-gray);
        font-family: sans-serif;
        overflow: hidden;
    }

    .button-wrapper {
        position: relative;
        width: 300px;
        height: 300px;
        cursor: pointer;
        transition: transform 0.2s;
    }

    .button-wrapper:hover {
        transform: scale(1.05);
    }
    
    .button-wrapper:active {
        transform: scale(0.95);
    }

    .nonagon {
        width: 100%;
        height: 100%;
        background-color: var(--frc-190-red);
        /* 
           Approximated 9-sided polygon (Nonagon).
           Vertices calculated roughly around a circle.
        */
        clip-path: polygon(
            50% 0%, 
            83% 12%, 
            100% 43%, 
            94% 78%, 
            68% 100%, 
            32% 100%, 
            6% 78%, 
            0% 43%, 
            17% 12%
        );
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5); /* Shadow might get clipped, but structure is here */
    }

    .hexagon {
        width: 60%;
        height: 60%;
        background-color: var(--frc-190-black);
        /* 
           Hexagon clip-path 
           Using drop-shadow filter to create a visible border effect around the clipped shape
        */
        filter: drop-shadow(0 0 5px rgba(0,0,0,0.5));
        clip-path: polygon(
            50% 0%, 
            100% 25%, 
            100% 75%, 
            50% 100%, 
            0% 75%, 
            0% 25%
        );
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2;
    }

    .label {
        color: white;
        font-size: 1.5rem;
        font-weight: 800;
        letter-spacing: 2px;
        text-align: center;
        line-height: 1.2;
    }

    .fab {
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        padding: 1rem 2rem;
        background-color: var(--frc-190-black);
        color: white;
        border: 2px solid var(--frc-190-red);
        border-radius: 50px;
        font-size: 1.2rem;
        cursor: pointer;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        transition: all 0.2s;
    }

    .fab:hover {
        background-color: #333;
        border-color: #e02200;
        transform: translateY(-2px);
    }
</style>
