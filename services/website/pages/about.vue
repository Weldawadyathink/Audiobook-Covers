<template>
  <div class="m-12 max-w-prose text-slate-50">
    <section>
      <h1>Image Processing</h1>

      <h2>Filenames</h2>
      <p>
        All images are assigned a
        <a
          href="https://en.wikipedia.org/wiki/Universally_unique_identifier"
          class="text-sky-300 hover:text-sky-500"
          >UUID</a
        >. This uuid serves as the filename for the file in all locations. If
        you want to find the same file in a different format or resolution,
        search for this uuid.
      </p>

      <h2>Original Images</h2>
      <p>
        Original images are stored in the <code>/original/</code> directory.
        Images will have their uuid as the filename, and the original file
        extension.
      </p>

      <h2>Image Conversion</h2>
      <p>Images are converted into the following formats:</p>
      <ul>
        <li><strong>JPEG</strong> - Stored in <code>/jpg/</code></li>
        <li><strong>PNG</strong> - Stored in <code>/png/</code></li>
        <li><strong>WEBP</strong> - Stored in <code>/webp/</code></li>
      </ul>

      <h2>Size Variants</h2>
      <p>
        Within each format folder, different resolution options are available:
      </p>
      <ul>
        <li><strong>200</strong>: Images reduced to 200 pixels in width</li>
        <li><strong>500</strong>: Images reduced to 500 pixels in width</li>
        <li><strong>1000</strong>: Images reduced to 1000 pixels in width</li>
        <li><strong>Original</strong>: Images in their original size</li>
      </ul>

      <h2>Visual Representation</h2>
      <p>
        Below is the structure of our directories and how images are organized:
      </p>
      <div>
        <pre class="fira-code">
        /
        ├── jpg/
        │   ├── 200/
        │   ├── 500/
        │   ├── 1000/
        │   └── original/
        ├── png/
        │   ├── 200/
        │   ├── 500/
        │   ├── 1000/
        │   └── original/
        ├── webp/
        │   ├── 200/
        │   ├── 500/
        │   ├── 1000/
        │   └── original/
        └── original/
      </pre
        >
      </div>
    </section>
    <h2>
      <a
        href="https://drive.google.com/drive/folders/1ksaJtXc4FTwFdIxFnkY5OfwC1DoExwVY?usp=sharing"
        class="text-sky-300 hover:text-sky-500"
        target="_blank"
        >Complete Archive Download</a
      >
    </h2>
  </div>
</template>

<script>
export default {
  name: "About",
};
</script>

<style module>

.fira-code {
  font-family: "Fira Code", monospace;
  font-feature-settings: "liga" 1, "calt" 1;
}

h1 {
  @apply text-xl font-bold -ml-6;
}

h2 {
  @apply text-lg font-semibold mt-6 -ml-6;
}

p {
  @apply text-base;
}
</style>
