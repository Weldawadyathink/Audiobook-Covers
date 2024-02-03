<template>
  <form @submit.prevent="handleSubmit" class="flex flex-row gap-6">
    <input
      type="text"
      v-model="searchQuery"
      :placeholder="randomPlaceholder"
      class="w-full rounded-full py-3 px-6 text-l text-xl bg-green-800 text-white"
    />
    <button
      type="submit"
      class="text-white rounded-full bg-green-700 px-6 text-2xl fade-in-out hover:bg-green-500 hover:scale-110 ease-in-out duration-150"
    >
      Search
    </button>
  </form>
</template>

<script>
import Axios from "axios";

export default {
  data() {
    return {
      searchQuery: "",
      randomPlaceholder: this.getRandomPlaceholder(),
    };
  },
  methods: {
    handleSubmit() {
      // this.$emit('search-submitted', this.searchQuery);
      this.$emit("search", null);
      const num_images = 10;
      const url = `https://api.audiobookcovers.com/cover/ai-search?q=${
        this.searchQuery
      }k=${num_images}&cacheBust=${new Date().getTime()}`;
      Axios.get(url).then((res) => {
        this.$emit("search", res.data);
      });
    },
    getRandomPlaceholder() {
      const placeholders = [
        "Dune...",
        "Star Wars...",
        "Isaac Asimov...",
        "Brandon Sanderson...",
        "Harry Potter...",
        "Stephen King...",
        "Louise Penny...",
        "Terry Pratchett...",
        "James McBride...",
        "Red Rising...",
        "Warriors...",
        "Zane Grey...",
        "Orson Scott Card...",
        "Patrick Rothfuss...",
        "Cory Doctorow...",
        "Legends of Shannara...",
        "Frank Herbert...",
        "Lemony Snicket...",
        "The Bad Beginning...",
        "Wool...",
        "Scott Meyer...",
        "Andrzej Sapkowski...",
        "Dragon...",
        "Cat...",
        "Tom Clancy...",
        "Naomi Novik...",
        "Song of the Beast...",
        "Carol Berg...",
        "The Dark Forest...",
        "Stephen Fry",
      ];
      const randomIndex = Math.floor(Math.random() * placeholders.length);
      return placeholders[randomIndex];
    },
  },
};
</script>
