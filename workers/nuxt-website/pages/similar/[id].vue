<template>
    <div>
        <h1>Route Information for /similar/{id}</h1>
        <p><strong>ID:</strong> {{ id }}</p>
    </div>
</template>

<script setup>
import { useRoute } from 'vue-router';

const route = useRoute();
const id = route.params.id; // Access the dynamic segment 'id'
</script>
