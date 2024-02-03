<template>
  <div
    @click.stop
    @click="closeModal"
    class="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center text-white text-center"
  >
    <div @click.stop class="rounded-3xl bg-stone-700 p-6 flex flex-col gap-4">
      <h1 class="text-3xl">Download Options</h1>
      <!-- Options -->
      <div class="flex flex-row gap-4">
        <!-- Format Buttons -->
        <div class="flex flex-col gap-4">
          <h1 class="text-xl">Formats</h1>
          <button
            v-for="option in formatOptions"
            :key="option.internal_name"
            @click="setFormat(option.internal_name)"
            :class="[
              format === option.internal_name ? 'bg-green-500' : 'bg-stone-600',
            ]"
            class="option-pill"
          >
            {{ option.display_name }}
          </button>
        </div>

        <!-- Size Options -->
        <div class="flex flex-col gap-4">
          <h1 class="text-xl">Sizes</h1>
          <button
            v-for="option in sizeOptions"
            :key="option.internal_name"
            @click="setSize(option.internal_name)"
            :class="[
              size === option.internal_name ? 'bg-green-500' : 'bg-stone-600',
              format === 'original' && option.internal_name !== 'original' ? 'bg-stone-800' : '',
            ]"
            class="option-pill"
          >
            {{ option.display_name }}
          </button>
        </div>
      </div>
      <button @click="download" class="p-2 bg-green-500 rounded-full w-full text-2xl" >Download Now</button>
    </div>
  </div>
</template>

<script>
import fileDownload from "js-file-download";
import Axios from "axios";

export default {
  props: {
    downloadLinks: Object,
  },
  data() {
    return {
      formatOptions: [
        { internal_name: "jpeg", display_name: "JPEG" },
        { internal_name: "png", display_name: "PNG" },
        { internal_name: "webp", display_name: "WebP" },
        { internal_name: "original", display_name: "Original File" },
      ],
      sizeOptions: [
        { internal_name: "200", display_name: "Small" },
        { internal_name: "500", display_name: "Medium" },
        { internal_name: "1000", display_name: "Large" },
        { internal_name: "original", display_name: "Full" },
      ],
      format: "jpeg",
      size: "original",
    };
  },
  watch: {
  },
  methods: {
    closeModal() {
      this.$emit("close"); // Emit an event when the modal is closed
    },
    setFormat(newFormat) {
      this.format = newFormat;
      if (newFormat == "original") {
        this.size = "original";
      }
    },
    setSize(newSize) {
      if (this.format == "original") {
        this.size = "original";
      } else {
        this.size = newSize;
      }
    },
    download() {
      let urlBase = '';
      if (this.format === 'original') {
        urlBase = this.downloadLinks.filename;
      } else {
        urlBase = this.downloadLinks.versions[this.format][this.size];
      }
      const downloadFilename = urlBase.split("/").pop();
      const url = `${urlBase}?cacheBust=${new Date().getTime()}`;
      Axios.get(url, {
        responseType: "blob",
      }).then((res) => {
        fileDownload(res.data, downloadFilename);
      });
    }
  },
};
</script>

<style>
.option-pill {
  @apply block p-2 rounded-full hover:scale-105 ease-in-out duration-100 min-w-32;
}
</style>
