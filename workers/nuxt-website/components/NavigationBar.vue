<template>
  <nav class="navbar flex flex-col sm:flex-row items-center">
    <a href="/" class="text-3xl m-6 text-emerald-600">AudiobookCovers.com</a>
    <dev class="flex flex-col sm:flex-row text-2xl">
      <a href="/about">About</a>
      <a href="/api">API</a>
      <a href="/support">Support</a>
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
  @apply mx-3 text-emerald-600;
}
</style>
