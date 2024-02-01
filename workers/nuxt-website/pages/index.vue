<template>
  <div class="bg-slate-700 flex flex-wrap justify-center gap-6">
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
          "filename": "https://download.audiobookcovers.com/original/6f35d6a6-07c5-49d8-bf64-b2e1251dd366.jpg",
          "versions": {
            "webp": {
              "200": "https://download.audiobookcovers.com/webp/200/6f35d6a6-07c5-49d8-bf64-b2e1251dd366.webp",
              "500": "https://download.audiobookcovers.com/webp/500/6f35d6a6-07c5-49d8-bf64-b2e1251dd366.webp",
              "1000": "https://download.audiobookcovers.com/webp/1000/6f35d6a6-07c5-49d8-bf64-b2e1251dd366.webp",
              "original": "https://download.audiobookcovers.com/webp/original/6f35d6a6-07c5-49d8-bf64-b2e1251dd366.webp"
            },
            "jpeg": {
              "200": "https://download.audiobookcovers.com/jpg/200/6f35d6a6-07c5-49d8-bf64-b2e1251dd366.jpg",
              "500": "https://download.audiobookcovers.com/jpg/500/6f35d6a6-07c5-49d8-bf64-b2e1251dd366.jpg",
              "1000": "https://download.audiobookcovers.com/jpg/1000/6f35d6a6-07c5-49d8-bf64-b2e1251dd366.jpg",
              "original": "https://download.audiobookcovers.com/jpg/original/6f35d6a6-07c5-49d8-bf64-b2e1251dd366.jpg"
            },
            "png": {
              "200": "https://download.audiobookcovers.com/png/200/6f35d6a6-07c5-49d8-bf64-b2e1251dd366.png",
              "500": "https://download.audiobookcovers.com/png/500/6f35d6a6-07c5-49d8-bf64-b2e1251dd366.png",
              "1000": "https://download.audiobookcovers.com/png/1000/6f35d6a6-07c5-49d8-bf64-b2e1251dd366.png",
              "original": "https://download.audiobookcovers.com/png/original/6f35d6a6-07c5-49d8-bf64-b2e1251dd366.png"
            }
          },
          "id": "6f35d6a6-07c5-49d8-bf64-b2e1251dd366",
          "permalink": "https://audiobookcovers.com/?id=6f35d6a6-07c5-49d8-bf64-b2e1251dd366",
          "source": "https://www.reddit.com/qgnnki"
        },
        {
          "filename": "https://download.audiobookcovers.com/original/c90a24fb-86c6-4302-86da-0390e80cd87a.png",
          "versions": {
            "webp": {
              "200": "https://download.audiobookcovers.com/webp/200/c90a24fb-86c6-4302-86da-0390e80cd87a.webp",
              "500": "https://download.audiobookcovers.com/webp/500/c90a24fb-86c6-4302-86da-0390e80cd87a.webp",
              "1000": "https://download.audiobookcovers.com/webp/1000/c90a24fb-86c6-4302-86da-0390e80cd87a.webp",
              "original": "https://download.audiobookcovers.com/webp/original/c90a24fb-86c6-4302-86da-0390e80cd87a.webp"
            },
            "jpeg": {
              "200": "https://download.audiobookcovers.com/jpg/200/c90a24fb-86c6-4302-86da-0390e80cd87a.jpg",
              "500": "https://download.audiobookcovers.com/jpg/500/c90a24fb-86c6-4302-86da-0390e80cd87a.jpg",
              "1000": "https://download.audiobookcovers.com/jpg/1000/c90a24fb-86c6-4302-86da-0390e80cd87a.jpg",
              "original": "https://download.audiobookcovers.com/jpg/original/c90a24fb-86c6-4302-86da-0390e80cd87a.jpg"
            },
            "png": {
              "200": "https://download.audiobookcovers.com/png/200/c90a24fb-86c6-4302-86da-0390e80cd87a.png",
              "500": "https://download.audiobookcovers.com/png/500/c90a24fb-86c6-4302-86da-0390e80cd87a.png",
              "1000": "https://download.audiobookcovers.com/png/1000/c90a24fb-86c6-4302-86da-0390e80cd87a.png",
              "original": "https://download.audiobookcovers.com/png/original/c90a24fb-86c6-4302-86da-0390e80cd87a.png"
            }
          },
          "id": "c90a24fb-86c6-4302-86da-0390e80cd87a",
          "permalink": "https://audiobookcovers.com/?id=c90a24fb-86c6-4302-86da-0390e80cd87a",
          "source": "https://www.reddit.com/j073yp"
        },
        {
          "filename": "https://download.audiobookcovers.com/original/5b99ad73-b1de-11ee-9ebd-69c4203ee0c5.jpg",
          "versions": {
            "webp": {
              "200": "https://download.audiobookcovers.com/webp/200/5b99ad73-b1de-11ee-9ebd-69c4203ee0c5.webp",
              "500": "https://download.audiobookcovers.com/webp/500/5b99ad73-b1de-11ee-9ebd-69c4203ee0c5.webp",
              "1000": "https://download.audiobookcovers.com/webp/1000/5b99ad73-b1de-11ee-9ebd-69c4203ee0c5.webp",
              "original": "https://download.audiobookcovers.com/webp/original/5b99ad73-b1de-11ee-9ebd-69c4203ee0c5.webp"
            },
            "jpeg": {
              "200": "https://download.audiobookcovers.com/jpg/200/5b99ad73-b1de-11ee-9ebd-69c4203ee0c5.jpg",
              "500": "https://download.audiobookcovers.com/jpg/500/5b99ad73-b1de-11ee-9ebd-69c4203ee0c5.jpg",
              "1000": "https://download.audiobookcovers.com/jpg/1000/5b99ad73-b1de-11ee-9ebd-69c4203ee0c5.jpg",
              "original": "https://download.audiobookcovers.com/jpg/original/5b99ad73-b1de-11ee-9ebd-69c4203ee0c5.jpg"
            },
            "png": {
              "200": "https://download.audiobookcovers.com/png/200/5b99ad73-b1de-11ee-9ebd-69c4203ee0c5.png",
              "500": "https://download.audiobookcovers.com/png/500/5b99ad73-b1de-11ee-9ebd-69c4203ee0c5.png",
              "1000": "https://download.audiobookcovers.com/png/1000/5b99ad73-b1de-11ee-9ebd-69c4203ee0c5.png",
              "original": "https://download.audiobookcovers.com/png/original/5b99ad73-b1de-11ee-9ebd-69c4203ee0c5.png"
            }
          },
          "id": "5b99ad73-b1de-11ee-9ebd-69c4203ee0c5",
          "permalink": "https://audiobookcovers.com/?id=5b99ad73-b1de-11ee-9ebd-69c4203ee0c5",
          "source": "https://reddit.com/13mn6zb"
        },
        {
          "filename": "https://download.audiobookcovers.com/original/b567a347-947e-4577-a48c-22236657acec.jpg",
          "versions": {
            "webp": {
              "200": "https://download.audiobookcovers.com/webp/200/b567a347-947e-4577-a48c-22236657acec.webp",
              "500": "https://download.audiobookcovers.com/webp/500/b567a347-947e-4577-a48c-22236657acec.webp",
              "1000": "https://download.audiobookcovers.com/webp/1000/b567a347-947e-4577-a48c-22236657acec.webp",
              "original": "https://download.audiobookcovers.com/webp/original/b567a347-947e-4577-a48c-22236657acec.webp"
            },
            "jpeg": {
              "200": "https://download.audiobookcovers.com/jpg/200/b567a347-947e-4577-a48c-22236657acec.jpg",
              "500": "https://download.audiobookcovers.com/jpg/500/b567a347-947e-4577-a48c-22236657acec.jpg",
              "1000": "https://download.audiobookcovers.com/jpg/1000/b567a347-947e-4577-a48c-22236657acec.jpg",
              "original": "https://download.audiobookcovers.com/jpg/original/b567a347-947e-4577-a48c-22236657acec.jpg"
            },
            "png": {
              "200": "https://download.audiobookcovers.com/png/200/b567a347-947e-4577-a48c-22236657acec.png",
              "500": "https://download.audiobookcovers.com/png/500/b567a347-947e-4577-a48c-22236657acec.png",
              "1000": "https://download.audiobookcovers.com/png/1000/b567a347-947e-4577-a48c-22236657acec.png",
              "original": "https://download.audiobookcovers.com/png/original/b567a347-947e-4577-a48c-22236657acec.png"
            }
          },
          "id": "b567a347-947e-4577-a48c-22236657acec",
          "permalink": "https://audiobookcovers.com/?id=b567a347-947e-4577-a48c-22236657acec",
          "source": "https://www.reddit.com/j117h8"
        },
        {
          "filename": "https://download.audiobookcovers.com/original/1705593d-b1e1-11ee-9212-69c4203ee0c5.jpg",
          "versions": {
            "webp": {
              "200": "https://download.audiobookcovers.com/webp/200/1705593d-b1e1-11ee-9212-69c4203ee0c5.webp",
              "500": "https://download.audiobookcovers.com/webp/500/1705593d-b1e1-11ee-9212-69c4203ee0c5.webp",
              "1000": "https://download.audiobookcovers.com/webp/1000/1705593d-b1e1-11ee-9212-69c4203ee0c5.webp",
              "original": "https://download.audiobookcovers.com/webp/original/1705593d-b1e1-11ee-9212-69c4203ee0c5.webp"
            },
            "jpeg": {
              "200": "https://download.audiobookcovers.com/jpg/200/1705593d-b1e1-11ee-9212-69c4203ee0c5.jpg",
              "500": "https://download.audiobookcovers.com/jpg/500/1705593d-b1e1-11ee-9212-69c4203ee0c5.jpg",
              "1000": "https://download.audiobookcovers.com/jpg/1000/1705593d-b1e1-11ee-9212-69c4203ee0c5.jpg",
              "original": "https://download.audiobookcovers.com/jpg/original/1705593d-b1e1-11ee-9212-69c4203ee0c5.jpg"
            },
            "png": {
              "200": "https://download.audiobookcovers.com/png/200/1705593d-b1e1-11ee-9212-69c4203ee0c5.png",
              "500": "https://download.audiobookcovers.com/png/500/1705593d-b1e1-11ee-9212-69c4203ee0c5.png",
              "1000": "https://download.audiobookcovers.com/png/1000/1705593d-b1e1-11ee-9212-69c4203ee0c5.png",
              "original": "https://download.audiobookcovers.com/png/original/1705593d-b1e1-11ee-9212-69c4203ee0c5.png"
            }
          },
          "id": "1705593d-b1e1-11ee-9212-69c4203ee0c5",
          "permalink": "https://audiobookcovers.com/?id=1705593d-b1e1-11ee-9212-69c4203ee0c5",
          "source": "https://reddit.com/117egc1"
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
