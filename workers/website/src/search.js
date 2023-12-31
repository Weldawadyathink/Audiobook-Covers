const searchInput = document.getElementById("search-input")
const searchBtn = document.getElementById("search-btn")
const resultsContainer = document.getElementById("results-container")
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
  resultsContainer.innerHTML = ""

  if (results.length === 0) {
    const noResultsMessage = document.createElement("p")
    noResultsMessage.textContent = "No results found."
    resultsContainer.appendChild(noResultsMessage)
    return
  }

  results.forEach((result) => {
    const coverContainer = document.createElement("div");
    coverContainer.className = "cover-container";

    // Card
    const card = document.createElement("div");
    card.className = "card";

    // Card front
    const front = document.createElement("div");
    front.className = "front"

    // Card back
    const back = document.createElement("div");
    back.className = "back"

    // Add image
    const coverImage = document.createElement("img");
    coverImage.src = result.small_filename;
    coverImage.className = "cover-image";
    front.appendChild(coverImage);






    // Source Link

    const sourceLink = document.createElement("a");
    sourceLink.href = result.source;
    sourceLink.className = "source-link";
    sourceLink.target = "_blank";

    const sourceIcon = document.createElement("img");
    sourceIcon.src = "dataset_linked.svg";
    sourceIcon.alt = "Source";
    sourceIcon.className = "source-icon";
    sourceLink.appendChild(sourceIcon);

    front.appendChild(sourceLink);




    // Share Link

    const shareLink = document.createElement("div");
    shareLink.className = "share-link"
    shareLink.addEventListener("click", () => copyToClipboard("https://google.com"));

    const shareIcon = document.createElement("img");
    shareIcon.src = "share.svg";
    shareIcon.alt = "Get sharing link";
    shareIcon.className = "share-icon";
    shareLink.appendChild(shareIcon)

    front.appendChild(shareLink)




    // Versions Link

    const versionsLink = document.createElement("div");
    versionsLink.className = "versions-link"
    versionsLink.addEventListener("click", (event) => flipCard(event.target));

    const versionsIcon = document.createElement("img");
    versionsIcon.src = "auto_awesome_motion.svg";
    versionsIcon.alt = "Photo Versions";
    versionsIcon.className = "versions-icon";
    versionsLink.appendChild(versionsIcon)

    front.appendChild(versionsLink)




    // Apply to results container
    card.appendChild(front);
    card.appendChild(back);
    coverContainer.appendChild(card);
    resultsContainer.appendChild(coverContainer);
  })
}






function flipCard(target) {
    const classToFlip = "cover-container";
    let element = target;
    while (element && element !== document.body) {
        if (element.classList.contains(classToFlip)) {
            element.classList.toggle("flipped")
            return
        }
        element = element.parentElement;
    }
}






function displayError(error) {
  resultsContainer.innerHTML = "";
  const errorMessage = document.createElement("p");
  errorMessage.textContent = `An error occurred: ${error.message}`;
  resultsContainer.appendChild(errorMessage);
}







function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert('Link copied to clipboard!');
  }).catch(err => {
    console.error('Failed to copy: ', err);
  });
}

