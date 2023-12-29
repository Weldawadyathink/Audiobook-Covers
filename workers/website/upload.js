function uploadCover() {
    const sourceUrl = document.getElementById('sourceUrl').value;
    const file = document.getElementById('fileUpload').files[0];

    if (!sourceUrl || !file) {
        alert("Please provide the source URL and select a file.");
        return;
    }

    // Extracting the file extension from the filename
    const fileName = file.name;
    const fileExtension = fileName.slice(((fileName.lastIndexOf(".") - 1) >>> 0) + 2); // gets extension without dot

    console.log({
        filename: fileName,
        extension: fileExtension,
        source: sourceUrl
    })

    if (!fileExtension) {
        alert("Could not determine the file extension.");
        return;
    }

    const formData = new FormData();
    formData.append('sourceUrl', sourceUrl);
    formData.append('extension', fileExtension); // sending the extracted extension

    const api_url = "https://dev.api.audiobookcovers.com"

    fetch(new URL(`/upload/cover?source=${encodeURIComponent(sourceUrl)}&extension=${encodeURIComponent(fileExtension)}`, api_url))
    .then(response => response.json())
    .then(data => uploadFileToS3(data.url, file))
    .catch(error => console.error('Error:', error));
}

function uploadFileToS3(presignedUrl, file) {
    fetch(presignedUrl, {
        method: 'PUT',
        body: file,
        headers: {
            'Content-Type': file.type // This will be based on the actual file selected
        }
    })
    .then(response => {
        if (response.ok) {
            console.log('Successfully uploaded file.');
            // Update UI to reflect the successful upload
        } else {
            console.error('Failed to upload file.');
            // Handle failures, maybe retry or provide feedback to the user
        }
    })
    .catch(error => console.error('Error:', error));
}
