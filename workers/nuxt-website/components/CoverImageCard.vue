<template>
    <div class="w-80 h-80 m-8 aspect-square rounded-3xl overflow-hidden hover:scale-110 ease-in-out duration-300">
        <img :src="imageData.versions.webp['200']" @click="handleClick" class="w-full h-full object-contain" />
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
