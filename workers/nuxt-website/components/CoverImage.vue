<!-- ImageItem.vue -->
<template>
    <div class="cover-image-item">
        <img :src="imageUrl" @click="handleClick" />
        <!-- Any additional interactive elements here -->
    </div>
</template>

<script>
export default {
    props: ['imageData'], // Allows you to pass an image URL to each instance of the component
    methods: {
        handleClick() {
            // Handle the image click event
            console.log('Image clicked!');
        },
    },
};
</script>

<style>

</style>
