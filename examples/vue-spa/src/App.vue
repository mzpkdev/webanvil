<script setup lang="ts">
import { ref } from "vue"

const count = ref(0)
</script>

<template>
    <main>
        <h1>WebAnvil Vue SPA</h1>
        <button type="button" @click="count += 1">Count: {{ count }}</button>
    </main>
</template>
