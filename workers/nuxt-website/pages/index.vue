<template>
  <div>
    <CoverImage imageUrl="https://download.audiobookcovers.com/webp/200/b1593d35-b1e0-11ee-b8e9-69c4203ee0c5.webp" />
    <CoverImage imageUrl="https://download.audiobookcovers.com/webp/200/e2a4481d-b1de-11ee-ac96-69c4203ee0c5.webp" />
  </div>
</template>

<script>
export default {
  name: 'IndexPage',
  data() {
    return {
      newItem: '',
      items: [],
    };
  },
  methods: {
    addItem() {
      if (this.newItem.trim() !== '') {
        this.items.push(this.newItem);
        this.newItem = '';
      }
    },
  },
};
</script>

<style>
/* Add any additional custom styles here */
</style>
