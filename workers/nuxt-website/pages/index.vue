<template>
  <div class="container mx-auto p-4">
    <div class="mb-4">
      <input v-model="newItem" type="text" placeholder="Add a new item" class="border p-2 mr-2">
      <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" @click="addItem">
        Add
      </button>
    </div>
    <ul>
      <li v-for="(item, index) in items" :key="index" class="border-b py-2">
        {{ item }}
      </li>
    </ul>
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
