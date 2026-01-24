<script>
    import { goto } from '@mateothegreat/svelte5-router';
</script>

<div class="container">
</div>

<button class="fab" on:click={() => goto('/event-select')}>
    Select Event
</button>

<style>
    .container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 80vh;
        font-family: sans-serif;
        text-align: center;
    }

    .logo {
        height: 150px;
        width: auto;
        margin-bottom: 2rem;
    }

    h1 {
        margin-bottom: 1rem;
        color: #333;
    }

    p {
        color: #666;
        font-size: 1.2rem;
    }

    .fab {
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        padding: 1rem 2rem;
        background-color: #007bff;
        color: white;
        border: none;
        border-radius: 50px;
        font-size: 1.2rem;
        cursor: pointer;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        transition: transform 0.2s, background-color 0.2s;
    }

    .fab:hover {
        background-color: #0056b3;
        transform: translateY(-2px);
    }
</style>
