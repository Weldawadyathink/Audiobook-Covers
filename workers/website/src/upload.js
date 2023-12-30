function uploadFile(file, signedRequest, url) {
    const options = {
        method: 'PUT',
        body: file
    };
    return fetch(signedRequest, options)
    .then(response => {
        if (!response.ok) {
            throw new Error(`${response.status}: ${response.statusText}`);
        }
        return url;
    });
}






function uploadToS3(file, source) {
    return getSignedRequest(file, source)
    .then(json => uploadFile(file, json.signedRequest, json.url))
    .then(url => {
        return url;
    })
    .catch(err => {
        console.error(err);
        return null;
    });
}





function getSignedRequest(file, source) {
    const api_url = "https://dev.api.audiobookcovers.com";
    const fileName = file.name
    const fileExtension = fileName.slice(((fileName.lastIndexOf(".") - 1) >>> 0) + 2);
    const mime_type = file.type
    return fetch(`${api_url}/upload/cover?source=${encodeURIComponent(source)}&extension=${encodeURIComponent(fileExtension)}&mime_type=${mime_type}`)
    .then(response => {
        if (!response.ok) {
            throw new Error(`${response.status}: ${response.statusText}`);
        }
        return response.json();
    });
}






async function uploadCover() {
    const sourceUrl = document.getElementById('sourceUrl').value;
    const file = document.getElementById('fileUpload').files[0];

    if (!sourceUrl || !file) {
        alert("Please provide the source URL and select a file.");
        return;
    }

    const fileName = file.name;
    const fileExtension = fileName.slice(((fileName.lastIndexOf(".") - 1) >>> 0) + 2);
    const mime_type = file.type

    if (!fileExtension) {
        alert("Could not determine the file extension.")
        return
    }

    if (!mime_type) {
        alert("Could not determine the file type.")
        return
    }

    const valid_mime_types = [
        'image/png',
        'image/jpeg',
        'image/webp',
    ]
    if (!valid_mime_types.includes(mime_type)) {
        alert("File format is not supported.")
    }

    const api_url = "https://dev.api.audiobookcovers.com";
    const s3_signed_url = await fetch(`${api_url}/upload/cover?source=${encodeURIComponent(sourceUrl)}&extension=${encodeURIComponent(fileExtension)}&mime_type=${mime_type}`)
    const options = {
        method: 'PUT',
        body: file
    };
    const res = await fetch(s3_signed_url.url, options)
    console.log(res)
}
