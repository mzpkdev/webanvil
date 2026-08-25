<script lang="ts">
    let count = 0

    const handleIncrement = (): void => {
        count += 1
    }
</script>

<main>
    <h1>WebAnvil Svelte SPA</h1>
    <button type="button" onclick={handleIncrement}>Count: {count}</button>
</main>
