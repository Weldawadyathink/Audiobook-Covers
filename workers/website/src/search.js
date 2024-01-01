const searchInput = document.getElementById("search-input")
const searchBtn = document.getElementById("search-btn")
const allResultsContainer = document.getElementById("results-container")
const searchTypeInputs = document.querySelectorAll(".search-type-input")

searchBtn.addEventListener("click", search)
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault()
    search()
  }
})

async function search() {
  let query = searchInput.value
  const selectedSearchType = Array.from(searchTypeInputs).find(
    (input) => input.checked
  ).value

  let apiUrl = ""
  if (selectedSearchType === "text") {
    apiUrl = `https://dev.api.audiobookcovers.com/cover/bytext/?q=${encodeURIComponent(query)}`
  } else {
    apiUrl = `https://dev.api.audiobookcovers.com/cover/byredditpostid/?q=${encodeURIComponent(query)}`
  }

  try {
    const response = await fetch(apiUrl)
    if (!response.ok) {
      throw new Error(response.status)
    }
    const results = await response.json()
    displayResults(results)
  } catch (error) {
    displayError(error)
  }

  searchInput.blur() // Remove the focus from the input element
}


function displayResults(results) {
  allResultsContainer.innerHTML = ""

  if (results.length === 0) {
    const noResultsMessage = document.createElement("p")
    noResultsMessage.textContent = "No results found."
    allResultsContainer.appendChild(noResultsMessage)
    return
  }

  results.forEach((result) => {
    const resultContainer = document.createElement("div");
    resultContainer.className = "result_container";

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
    shareLink.addEventListener("click", () => copyToClipboard("https://google.com"));
    shareLink.src = "share.svg";
    shareLink.alt = "Get sharing link";

    front.appendChild(shareLink);




    // Back of card

    const back = document.createElement("div");
    back.className = "back fill_cover rounded";

    // Back button

    const backButton = document.createElement("img");
    backButton.className = "corner_top_left"
    backButton.addEventListener("click", (event) => flipCard(event.target))
    backButton.src = "navigate_before.svg";
    backButton.alt = "Go back";
    back.appendChild(backButton);




    // Apply to results container
    card.appendChild(front);
    card.appendChild(back);
    resultContainer.appendChild(card);
    allResultsContainer.appendChild(resultContainer);
  })
}






function downloadFile(url) {
  const link = document.createElement("a");
  link.href = url;
  link.download = url.split("//").pop();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}






function flipCard(target) {
    const classToFlip = "can_be_flipped";
    let element = target;
    while (element && element !== document.body && !element.classList.contains(classToFlip)) {
        element = element.parentElement;
    }
    const elementsToFlip = new Set([element, ...document.querySelectorAll(".can_be_flipped.flipped")]);
    console.log(elementsToFlip)
    elementsToFlip.forEach((element) => {
        element.classList.toggle("flipped");
    });
}






function displayError(error) {
  allResultsContainer.innerHTML = "";
  const errorMessage = document.createElement("p");
  errorMessage.textContent = `An error occurred: ${error.message}`;
  allResultsContainer.appendChild(errorMessage);
}







function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert('Link copied to clipboard!');
  }).catch(err => {
    console.error('Failed to copy: ', err);
  });
}

