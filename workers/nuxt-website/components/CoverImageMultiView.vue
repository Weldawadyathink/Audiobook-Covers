<template>
  <div class="flex flex-wrap justify-center gap-6">
    <CoverImageCard
      v-for="(imageData, index) in imageList"
      :key="index"
      :image-data="imageData"
      :current-flipped-card="flippedCard"
      @flipCard="handleCardFlip"
    />
  </div>
</template>

<script>
export default {
  name: "CoverImageMultiView",
  props: ["imageList"],
  data() {
    return {
      flippedCard: "",
    };
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
