<template>
    <CoverImageCard v-for="(imageData, index) in imageList" :key="index" :image-data="imageData" />
</template>

<script>
export default {
    name: 'CoverImageMultiView',
    props: [
        'imageList',
    ],
};
</script>

<style></style>
