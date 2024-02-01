<template>
    <div class="cover-image-card max-w-[500px] max-h-[500px] aspect-w-1 aspect-h-1">
        <img :src="imageData.versions.webp['200']" @click="handleClick" />
    </div>
</template>

<script>
export default {
    props: ['imageData'],
    methods: {
        handleClick() {
            console.log('Image clicked!');
        },
    },
};
</script>

<style>

</style>
