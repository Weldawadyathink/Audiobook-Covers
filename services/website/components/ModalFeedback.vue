<template>
  <div
    @click.stop
    @click="closeModal"
    class="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center text-white text-center"
  >
    <div @click.stop class="rounded-3xl bg-stone-700 p-6 flex flex-col gap-4">
      <h1 class="text-3xl">Feedback</h1>
      <button
        v-for="(entry, index) in feedbackDefaultOptions"
        :key="index"
        @click="handleSubmit(entry.payload)"
        class="block p-2 rounded-full hover:scale-105 ease-in-out duration-100 min-w-80 bg-green-500 text-xl"
      >
        {{ entry.name }}
      </button>
      <form
        @submit.prevent="handleSubmit(feedback)"
        class="flex flex-row gap-3"
      >
        <input
          type="text"
          v-model="feedback"
          placeholder="Custom message"
          class="w-full rounded-full py-3 px-6 text-l text-xl bg-green-800 text-white"
        />
        <button
          type="submit"
          class="p-2 bg-green-500 rounded-full w-full text-xl"
        >
          Send Feedback
        </button>
      </form>
    </div>
  </div>
</template>

<script>
import Axios from "axios";

export default {
  props: {
    imageId: Object,
  },
  data() {
    return {
      feedback: "",
      feedbackDefaultOptions: [
        {
          name: "This image contains multiple covers",
          payload: "multiple-covers",
        },
        {
          name: "This image is inappropriate",
          payload: "inappropriate",
        },
        {
          name: "This image is corrupt",
          payload: "corrupt",
        },
      ],
    };
  },
  watch: {},
  methods: {
    closeModal() {
      this.$emit("close"); // Emit an event when the modal is closed
    },
    handleSubmit(message) {
      console.log(`Sending feedback ${message}`);
      const url = `https://api.audiobookcovers.com/cover/give-feedback?id=${
        this.imageId
      }&comment=${encodeURIComponent(message)}`;
      Axios.post(url).then(() => this.closeModal());
    },
  },
};
</script>

<style>
</style>
