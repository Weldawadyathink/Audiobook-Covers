<template>
  <div
    @click.stop
    @click="closeModal"
    class="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center text-white text-center"
  >
    <div @click.stop class="rounded-3xl bg-stone-700 p-6 flex flex-col gap-4">
      <h1 class="text-3xl">Feedback</h1>
      <form @submit.prevent="handleSubmit">
        <button
          @click="download"
          class="p-2 bg-green-500 rounded-full w-full text-2xl"
        >
          Send Feedback
        </button>
      </form>
    </div>
  </div>
</template>

<script>
import fileDownload from "js-file-download";
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
    handleSubmit() {},
  },
};
</script>

<style>
.option-pill {
  @apply block p-2 rounded-full hover:scale-105 ease-in-out duration-100 min-w-32;
}
</style>
