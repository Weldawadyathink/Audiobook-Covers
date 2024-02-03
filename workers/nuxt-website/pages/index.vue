<template>
  <div class="flex flex-col">
    <SearchBar @search="searchHandler" class="mx-10 my-6"/>
    <CoverImageMultiView :image-list="images" v-if="images" />
  </div>
</template>

<script>
import Axios from "axios";

export default {
  name: "IndexPage",
  data() {
    return {
      images: null,
    };
  },
  mounted() {
    const num_images = 10;
    const url = `https://api.audiobookcovers.com/cover/random?k=${num_images}&cacheBust=${new Date().getTime()}`;
    Axios.get(url).then((res) => {
      this.images = res.data;
    });
  },
  methods: {
    searchHandler(results) {
      this.images = results;
    },
  }
};
</script>

<style>

</style>
