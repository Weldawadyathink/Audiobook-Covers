<template>
  <div class="hover:scale-110 ease-in-out duration-300 w-80 h-80 aspect-square">
    <div :class="{ flipped: isFlipped }" class="card w-full h-full">
      <div @click="flipCard" class="front" :style="{ boxShadow: boxShadowStyle }">
        <img
          :src="imageData.versions.webp['1000']"
          crossorigin="anonymous"
          class="w-full h-full object-contain"
          @load="applyShadow"
          ref="cardImage"
        />
      </div>
      <div @click="flipCard" class="back bg-stone-700">
        <a :href="`/image/${imageData.id}`" @click.stop class="option-pill">
          Link to this image
        </a>
        <a
          :href="imageData.source"
          @click.stop
          target="_blank"
          class="option-pill"
        >
          Image Source
        </a>
        <a :href="`/similar/${imageData.id}`" @click.stop class="option-pill">
          Find similar images
        </a>
        <a
          @click.stop
          @click="openDownloadModal"
          class="option-pill"
        >
          Download image file
        </a>
      </div>
    </div>
  </div>
  <ModalDownload v-if="downloadModalVisible" @close="closeDownloadModal" />
</template>

<script>
import fileDownload from "js-file-download";
import Axios from "axios";
import { v4 as uuidv4 } from "uuid";
import ColorThief from 'colorthief';

export default {
  props: ["imageData", "currentFlippedCard"],
  data() {
    return {
      isFlipped: false,
      boxShadowStyle: '0 0 15px rgba(0, 0, 0, 0.5)', // Default shadow style
      uniqueID: uuidv4(),
      downloadModalVisible: false,
    };
  },
  watch: {
    currentFlippedCard(newVal) {
      if (this.uniqueID !== newVal && this.isFlipped) {
        this.isFlipped = false;
      }
    },
  },
  methods: {
    flipCard() {
      this.isFlipped = !this.isFlipped;
      this.$emit("flipCard", this.uniqueID);
    },
    downloadImage(format, size) {
      let urlBase = "";
      let downloadFileName = "";
      if (format == "original") {
        urlBase = this.imageData.filename;
        downloadFileName = `${this.imageData.id}.${urlBase.split(".").pop()}`;
      } else {
        urlBase = this.imageData.versions[format][size];
        downloadFileName = `${this.imageData.id}.${format}`;
      }
      const url = `${urlBase}?cacheBust=${new Date().getTime()}`;
      Axios.get(url, {
        responseType: "blob",
      }).then((res) => {
        fileDownload(res.data, downloadFileName);
      });
    },
    applyShadow() {
      const colorThief = new ColorThief();
      const img = this.$refs.cardImage;

      // Make sure the image is loaded
      if (img.complete) {
        const dominantColor = colorThief.getColor(img);
        this.boxShadowStyle = `0 0 15px rgba(${dominantColor[0]}, ${dominantColor[1]}, ${dominantColor[2]}, 0.5)`;
      }
    },
    openDownloadModal() {
      this.downloadModalVisible = true;
    },
    closeDownloadModal() {
      this.downloadModalVisible = false;
    },
  },
};
</script>

<style scoped>
.back {
  transform: rotateY(180deg);
  z-index: 2;
}

.front,
.back {
  @apply rounded-3xl overflow-hidden;
  backface-visibility: hidden;
  position: absolute;
  width: 100%;
  height: 100%;
}

.card.flipped {
  transform: rotateY(180deg);
}

.card {
  transition: transform 0.6s;
  transform-style: preserve-3d;
  cursor: pointer;
}

.option-pill {
  @apply block m-4 p-2 rounded-full bg-green-500 text-center hover:bg-green-600 hover:scale-105 ease-in-out duration-100 text-white;
}
</style>
