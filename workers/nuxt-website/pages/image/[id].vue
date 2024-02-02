<template>
  <div class="bg-slate-700">
    <CoverImageMultiView :image-list="images" v-if="images" />
  </div>
</template>

<script>
import Axios from "axios";
import { useRoute } from 'vue-router';

export default {
  name: "SimilarToPage",
  data() {
    return {
      images: null,
    };
  },
  mounted() {
    const id = useRoute().params.id;
    const url = `https://api.audiobookcovers.com/cover/id?id=${id}&cacheBust=${new Date().getTime()}`;
    Axios.get(url).then((res) => {
      this.images = [res.data];
    });
  },
};
</script>

<style>

</style>
