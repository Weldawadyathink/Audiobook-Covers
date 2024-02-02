<template>
    <CoverImageCard v-for="(imageData, index) in imageList" :key="index" :image-data="imageData"
    :current-flipped-card="flippedCard" @flipCard="handleCardFlip" />
</template>

<script>
export default {
    name: 'CoverImageMultiView',
    props: [
        'imageList',
    ],
    data() {
        return {
            flippedCard: '',
        }
    },
    methods: {
        handleCardFlip(id) {
            setTimeout(() => {
                this.flippedCard = id;
            }, 300);
        },
    },
};
</script>

<style></style>
