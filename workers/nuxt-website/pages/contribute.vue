<template>
  <div class="m-12 max-w-prose text-slate-50">
    <h1 class="text-3xl">How to Contribute</h1>

    <h2 class="text-xl">I have artwork to contribute</h2>
    <p>
      Awesome! Post the artwork to
      <a href="https://reddit.com/r/audiobookcovers">/r/audiobookcovers</a>. If
      you use an image host that is supported by the
      <a
        href="https://github.com/aliparlakci/bulk-downloader-for-reddit?tab=readme-ov-file#list-of-currently-supported-sources"
        >Bulk Downloader For Reddit</a
      >
      project, it will be automatically scanned and uploaded into my database.
      If you have another source for high quality cover artwork, contact me at
      <a href="mailto:admin@audiobookcovers.com">admin@audiobookcovers.com</a>.
      This project would not be possible without the community contributions.
      Thank you for your hard work!
    </p>

    <h2 class="text-xl">I am a programmer</h2>
    <p>
      The source code for this project is
      <a href="https://github.com/Weldawadyathink/Audiobook-Covers"
        >hosted on GitHub</a
      >. I welcome any code contributions.
    </p>

    <h2 class="text-xl">I want to help pay for server costs</h2>
    <p>
      I have put a lot of work into keeping server costs low, but there are
      still some costs. You can contribute using GitHub Sponsors. All money
      received will go directly into hosting and improving this project.
    </p>
    <iframe
      src="https://github.com/sponsors/Weldawadyathink/button"
      title="Sponsor Weldawadyathink"
      height="32"
      width="114"
      style="border: 0; border-radius: 6px"
      class="mt-2"
    ></iframe>
  </div>
</template>

<script>
export default {
  name: "Support",
};
</script>

<style module>
h1 {
  @apply text-xl font-bold -ml-6;
}

h2 {
  @apply text-lg font-semibold mt-6 -ml-6 mb-2;
}
</style>
