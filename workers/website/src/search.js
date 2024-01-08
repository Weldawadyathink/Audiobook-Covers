window.onload = () => {
  document.getElementById("search_form").addEventListener("submit", (event) => {
    event.preventDefault();
    search();
  });

  document
    .getElementById("download_button")
    .addEventListener("click", download_button_handler);

  getCoverById();
};

function download_options_limiter() {
  const download_format_input = document.querySelector(
    "input[name='radio_download_format']:checked"
  );
  if (download_format_input.value === "original") {
    document.getElementById("radio_download_size_original").checked = true;
    document.getElementById("radio_download_size_200").disabled = true;
    document.getElementById("radio_download_size_500").disabled = true;
    document.getElementById("radio_download_size_1000").disabled = true;
  } else {
    document.getElementById("radio_download_size_200").disabled = false;
    document.getElementById("radio_download_size_500").disabled = false;
    document.getElementById("radio_download_size_1000").disabled = false;
  }
}

document
  .querySelectorAll(
    'input[type="radio"][name="radio_download_format"], input[type="radio"][name="radio_download_size"]'
  )
  .forEach((button) =>
    button.addEventListener("click", download_options_limiter)
  );

async function search() {
  const searchInput = document.getElementById("search-input");
  const searchTypeInputs = document.querySelectorAll(".search-type-input");
  const download_form = document.querySelector("#download_selection_window");
  document.querySelector("main").appendChild(download_form);
  let query = searchInput.value;
  const selectedSearchType = Array.from(searchTypeInputs).find(
    (input) => input.checked
  ).value;

  let apiUrl = "";
  if (selectedSearchType === "text") {
    apiUrl = `https://dev.api.audiobookcovers.com/cover/bytext/?q=${encodeURIComponent(
      query
    )}`;
  } else {
    apiUrl = `https://dev.api.audiobookcovers.com/cover/byredditpostid/?q=${encodeURIComponent(
      query
    )}`;
  }

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(response.status);
    }
    const results = await response.json();
    displayResults(results);
  } catch (error) {
    displayError(error);
  }

  searchInput.blur(); // Remove the focus from the input element
}

function displayResults(results) {
  const allResultsContainer = document.getElementById("results-container");
  allResultsContainer.innerHTML = "";

  if (results.length === 0) {
    const noResultsMessage = document.createElement("p");
    noResultsMessage.textContent = "No results found.";
    allResultsContainer.appendChild(noResultsMessage);
    return;
  }

  results.forEach((result) => {
    const resultContainer = document.createElement("div");
    resultContainer.className = "result_container";

    resultContainer.dataset.jpeg_200 = result.versions.jpeg[200];
    resultContainer.dataset.jpeg_500 = result.versions.jpeg[500];
    resultContainer.dataset.jpeg_1000 = result.versions.jpeg[1000];
    resultContainer.dataset.jpeg_original = result.versions.jpeg.original;

    resultContainer.dataset.png_200 = result.versions.png[200];
    resultContainer.dataset.png_500 = result.versions.png[500];
    resultContainer.dataset.png_1000 = result.versions.png[1000];
    resultContainer.dataset.png_original = result.versions.png.original;

    resultContainer.dataset.webp_200 = result.versions.webp[200];
    resultContainer.dataset.webp_500 = result.versions.webp[500];
    resultContainer.dataset.webp_1000 = result.versions.webp[1000];
    resultContainer.dataset.webp_original = result.versions.webp.original;

    resultContainer.dataset.original = result.filename;

    // Card
    const card = document.createElement("div");
    card.className = "card fill_cover rounded can_be_flipped";

    // Card front
    const front = document.createElement("div");
    front.className = "front fill_cover rounded";

    // Add image
    const coverImage = document.createElement("img");
    coverImage.src = result.versions.webp["1000"];
    coverImage.className = "fill_cover rounded";
    coverImage.addEventListener("click", (event) => flipCard(event.target));
    front.appendChild(coverImage);

    // Source Link
    const sourceLink = document.createElement("a");
    sourceLink.href = result.source;
    sourceLink.className = "corner_bottom_right";
    sourceLink.target = "_blank";

    const sourceIcon = document.createElement("img");
    sourceIcon.src = "dataset_linked.svg";
    sourceIcon.alt = "Source";
    sourceIcon.className = "fill_cover";
    sourceLink.appendChild(sourceIcon);

    front.appendChild(sourceLink);

    // Share Link
    const shareLink = document.createElement("img");
    shareLink.className = "corner_bottom_left";
    shareLink.addEventListener("click", () =>
      copyToClipboard("https://google.com")
    );
    shareLink.src = "share.svg";
    shareLink.alt = "Get sharing link";

    front.appendChild(shareLink);

    // Back of card
    const back = document.createElement("div");
    back.className = "back fill_cover rounded";

    // Apply to results container
    card.appendChild(front);
    card.appendChild(back);
    resultContainer.appendChild(card);
    allResultsContainer.appendChild(resultContainer);
  });
}

function download_button_handler() {
  const download_button = document.getElementById("download_button");
  const download_format = document.querySelector(
    "input[name='radio_download_format']:checked"
  ).value;
  const download_size = document.querySelector(
    "input[name='radio_download_size']:checked"
  ).value;

  let dataset_element = download_button;
  while (
    dataset_element &&
    dataset_element !== document.body &&
    !dataset_element.classList.contains("result_container")
  ) {
    dataset_element = dataset_element.parentElement;
  }

  let url = "";
  if (download_format === "original") {
    url = dataset_element.dataset.original;
  } else {
    url = dataset_element.dataset[`${download_format}_${download_size}`];
  }
  const server_file_name = url.split("/").pop();
  const [id, extension] = server_file_name.split(".");
  let file_addition = "";
  if (download_format === "original") {
    file_addition = "_original";
  } else if (download_size === "200") {
    file_addition = "_small";
  } else if (download_size === "500") {
    file_addition = "_medium";
  } else if (download_size === "1000") {
    file_addition = "_large";
  } else if (download_size === "original") {
    file_addition = "_full";
  }
  const file_name = `${id}${file_addition}.${extension}`;

  fetch(url, { method: "GET", cache: "no-store" })
    .then((response) => response.blob())
    .then((blob) => downloadFile(blob, file_name))
    .catch(console.error);
}

function downloadFile(data, filename, mime, bom) {
  // Taken from https://github.com/kennethjiang/js-file-download
  var blobData = typeof bom !== "undefined" ? [bom, data] : [data];
  var blob = new Blob(blobData, { type: mime || "application/octet-stream" });
  if (typeof window.navigator.msSaveBlob !== "undefined") {
    // IE workaround for "HTML7007: One or more blob URLs were
    // revoked by closing the blob for which they were created.
    // These URLs will no longer resolve as the data backing
    // the URL has been freed."
    window.navigator.msSaveBlob(blob, filename);
  } else {
    var blobURL =
      window.URL && window.URL.createObjectURL
        ? window.URL.createObjectURL(blob)
        : window.webkitURL.createObjectURL(blob);
    var tempLink = document.createElement("a");
    tempLink.style.display = "none";
    tempLink.href = blobURL;
    tempLink.setAttribute("download", filename);

    // Safari thinks _blank anchor are pop ups. We only want to set _blank
    // target if the browser does not support the HTML5 download attribute.
    // This allows you to download files in desktop safari if pop up blocking
    // is enabled.
    if (typeof tempLink.download === "undefined") {
      tempLink.setAttribute("target", "_blank");
    }

    document.body.appendChild(tempLink);
    tempLink.click();

    // Fixes "webkit blob resource error 1"
    setTimeout(function () {
      document.body.removeChild(tempLink);
      window.URL.revokeObjectURL(blobURL);
    }, 200);
  }
}

function flipCard(target) {
  const classToFlip = "can_be_flipped";
  let element = target;
  while (
    element &&
    element !== document.body &&
    !element.classList.contains(classToFlip)
  ) {
    element = element.parentElement;
  }
  const download_form = document.querySelector("#download_selection_window");
  const card_back = element.querySelector("div.back");
  card_back.appendChild(download_form);
  const elementsToFlip = new Set([
    element,
    ...document.querySelectorAll(".can_be_flipped.flipped"),
  ]);
  elementsToFlip.forEach((element) => {
    element.classList.toggle("flipped");
  });
}

function displayError(error) {
  const allResultsContainer = document.getElementById("results-container");
  allResultsContainer.innerHTML = "";
  const errorMessage = document.createElement("p");
  errorMessage.textContent = `An error occurred: ${error.message}`;
  allResultsContainer.appendChild(errorMessage);
}

function copyToClipboard(text) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      alert("Link copied to clipboard!");
    })
    .catch((err) => {
      console.error("Failed to copy: ", err);
    });
}

window.addEventListener("storage", (event) => {
  if (event.key === "download_type") {
  }
  if (event.key === "download_size") {
  }
});

async function getCoverById() {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  const search_id = urlParams.get("id");
  if (search_id) {
    const apiUrl = `https://dev.api.audiobookcovers.com/cover/id?id=${search_id}`;
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(response.status);
      }
      const results = await response.json();
      displayResults([results]);
    } catch (error) {
      displayError(error);
    }
  }
}
