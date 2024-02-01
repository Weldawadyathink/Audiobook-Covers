<template>
  <div>
    <CoverImageCard v-for="(imageData, index) in images" :key="index" :image-data="imageData" />
  </div>
</template>

<script>
export default {
  name: 'IndexPage',
  data() {
    return {
      images: [
        {
          "filename": "https://download.audiobookcovers.com/original/455a591e-bedf-4d42-b388-2f80fa075511.jpg",
          "versions": {
            "webp": {
              "200": "https://download.audiobookcovers.com/webp/200/455a591e-bedf-4d42-b388-2f80fa075511.webp",
              "500": "https://download.audiobookcovers.com/webp/500/455a591e-bedf-4d42-b388-2f80fa075511.webp",
              "1000": "https://download.audiobookcovers.com/webp/1000/455a591e-bedf-4d42-b388-2f80fa075511.webp",
              "original": "https://download.audiobookcovers.com/webp/original/455a591e-bedf-4d42-b388-2f80fa075511.webp"
            },
            "jpeg": {
              "200": "https://download.audiobookcovers.com/jpg/200/455a591e-bedf-4d42-b388-2f80fa075511.jpg",
              "500": "https://download.audiobookcovers.com/jpg/500/455a591e-bedf-4d42-b388-2f80fa075511.jpg",
              "1000": "https://download.audiobookcovers.com/jpg/1000/455a591e-bedf-4d42-b388-2f80fa075511.jpg",
              "original": "https://download.audiobookcovers.com/jpg/original/455a591e-bedf-4d42-b388-2f80fa075511.jpg"
            },
            "png": {
              "200": "https://download.audiobookcovers.com/png/200/455a591e-bedf-4d42-b388-2f80fa075511.png",
              "500": "https://download.audiobookcovers.com/png/500/455a591e-bedf-4d42-b388-2f80fa075511.png",
              "1000": "https://download.audiobookcovers.com/png/1000/455a591e-bedf-4d42-b388-2f80fa075511.png",
              "original": "https://download.audiobookcovers.com/png/original/455a591e-bedf-4d42-b388-2f80fa075511.png"
            }
          },
          "id": "455a591e-bedf-4d42-b388-2f80fa075511",
          "permalink": "https://audiobookcovers.com/?id=455a591e-bedf-4d42-b388-2f80fa075511",
          "source": "https://www.reddit.com/revfjl"
        },
        {
          "filename": "https://download.audiobookcovers.com/original/8c8df96b-b1df-11ee-8d3b-69c4203ee0c5.jpg",
          "versions": {
            "webp": {
              "200": "https://download.audiobookcovers.com/webp/200/8c8df96b-b1df-11ee-8d3b-69c4203ee0c5.webp",
              "500": "https://download.audiobookcovers.com/webp/500/8c8df96b-b1df-11ee-8d3b-69c4203ee0c5.webp",
              "1000": "https://download.audiobookcovers.com/webp/1000/8c8df96b-b1df-11ee-8d3b-69c4203ee0c5.webp",
              "original": "https://download.audiobookcovers.com/webp/original/8c8df96b-b1df-11ee-8d3b-69c4203ee0c5.webp"
            },
            "jpeg": {
              "200": "https://download.audiobookcovers.com/jpg/200/8c8df96b-b1df-11ee-8d3b-69c4203ee0c5.jpg",
              "500": "https://download.audiobookcovers.com/jpg/500/8c8df96b-b1df-11ee-8d3b-69c4203ee0c5.jpg",
              "1000": "https://download.audiobookcovers.com/jpg/1000/8c8df96b-b1df-11ee-8d3b-69c4203ee0c5.jpg",
              "original": "https://download.audiobookcovers.com/jpg/original/8c8df96b-b1df-11ee-8d3b-69c4203ee0c5.jpg"
            },
            "png": {
              "200": "https://download.audiobookcovers.com/png/200/8c8df96b-b1df-11ee-8d3b-69c4203ee0c5.png",
              "500": "https://download.audiobookcovers.com/png/500/8c8df96b-b1df-11ee-8d3b-69c4203ee0c5.png",
              "1000": "https://download.audiobookcovers.com/png/1000/8c8df96b-b1df-11ee-8d3b-69c4203ee0c5.png",
              "original": "https://download.audiobookcovers.com/png/original/8c8df96b-b1df-11ee-8d3b-69c4203ee0c5.png"
            }
          },
          "id": "8c8df96b-b1df-11ee-8d3b-69c4203ee0c5",
          "permalink": "https://audiobookcovers.com/?id=8c8df96b-b1df-11ee-8d3b-69c4203ee0c5",
          "source": "https://reddit.com/14v6q6a"
        },
        {
          "filename": "https://download.audiobookcovers.com/original/828f8a05-2631-4389-b9fa-1bb0689b744a.png",
          "versions": {
            "webp": {
              "200": "https://download.audiobookcovers.com/webp/200/828f8a05-2631-4389-b9fa-1bb0689b744a.webp",
              "500": "https://download.audiobookcovers.com/webp/500/828f8a05-2631-4389-b9fa-1bb0689b744a.webp",
              "1000": "https://download.audiobookcovers.com/webp/1000/828f8a05-2631-4389-b9fa-1bb0689b744a.webp",
              "original": "https://download.audiobookcovers.com/webp/original/828f8a05-2631-4389-b9fa-1bb0689b744a.webp"
            },
            "jpeg": {
              "200": "https://download.audiobookcovers.com/jpg/200/828f8a05-2631-4389-b9fa-1bb0689b744a.jpg",
              "500": "https://download.audiobookcovers.com/jpg/500/828f8a05-2631-4389-b9fa-1bb0689b744a.jpg",
              "1000": "https://download.audiobookcovers.com/jpg/1000/828f8a05-2631-4389-b9fa-1bb0689b744a.jpg",
              "original": "https://download.audiobookcovers.com/jpg/original/828f8a05-2631-4389-b9fa-1bb0689b744a.jpg"
            },
            "png": {
              "200": "https://download.audiobookcovers.com/png/200/828f8a05-2631-4389-b9fa-1bb0689b744a.png",
              "500": "https://download.audiobookcovers.com/png/500/828f8a05-2631-4389-b9fa-1bb0689b744a.png",
              "1000": "https://download.audiobookcovers.com/png/1000/828f8a05-2631-4389-b9fa-1bb0689b744a.png",
              "original": "https://download.audiobookcovers.com/png/original/828f8a05-2631-4389-b9fa-1bb0689b744a.png"
            }
          },
          "id": "828f8a05-2631-4389-b9fa-1bb0689b744a",
          "permalink": "https://audiobookcovers.com/?id=828f8a05-2631-4389-b9fa-1bb0689b744a",
          "source": "https://www.reddit.com/vwaczi"
        }
      ]
    };
  },
  methods: {

  },
};
</script>

<style>
/* Add any additional custom styles here */
</style>
