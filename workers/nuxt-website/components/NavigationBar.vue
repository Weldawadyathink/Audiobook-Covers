<template>
  <nav class="navbar flex flex-col sm:flex-row items-center px-6 py-4 bg-green-600 text-white">
    <a href="/" class="text-3xl p-4">AudiobookCovers.com</a>
    <dev class="flex flex-col sm:flex-row text-2xl">
      <a href="/about">About</a>
      <a href="/api">API</a>
      <a href="/contribute">Contribute</a>
    </dev>
  </nav>
</template>

<script>
export default {
  name: "NavigationBar",
};
</script>

<style scoped>
a {
  @apply mx-3;
}
</style>
