async function uploadCover() {
    const sourceUrl = document.getElementById('sourceUrl').value;
    const file = document.getElementById('fileUpload').files[0];

    if (!sourceUrl || !file) {
        alert("Please provide the source URL and select a file.");
        return;
    }

    const fileName = file.name;
    const fileExtension = fileName.split('.').pop();
    const mime_type = file.type;

    if (!fileExtension) {
        alert("Could not determine the file extension.");
        return;
    }

    if (!mime_type) {
        alert("Could not determine the file type.");
        return;
    }

    const valid_mime_types = [
        'image/png',
        'image/jpeg',
        'image/webp',
    ];
    if (!valid_mime_types.includes(mime_type)) {
        alert("File format is not supported.");
        return;
    }

    const username = prompt("Please enter your username:");
    const password = prompt("Please enter your password:");

    if (!username || !password) {
        alert("Username and password are required for authentication.");
        throw new Error("Authentication credentials not provided.");
    }

    const credentials = btoa(`${username}:${password}`);


    const status = await upload_to_s3(file, sourceUrlm, credentials);
    alert(status);
}





async function get_presigned_url(source, extension, mime_type, credentials) {
    const url = `https://dev.api.audiobookcovers.com/upload/cover?extension=${extension}&source=${encodeURIComponent(source)}&mime_type=${mime_type}`;
    const requestOptions = {
        method: 'GET',
        redirect: 'follow',
        headers: new Headers({
            "Authorization": `Basic ${credentials}`
        }),
    };
    return fetch(url, requestOptions)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok: ' + response.statusText);
            }
            return response.json();
        })
        .then(result => result.url);
}






async function upload_to_s3(file, source, credentials) {

    // Get pre-signed url
    const mime_type = file.type;
    const fileExtension = file.name.split('.').pop();
    const signed_url = await get_presigned_url(source, fileExtension, mime_type, credentials);


    // Upload to pre-signed url
    const requestOptions = {
        method: 'PUT',
        body: file,
        redirect: 'follow'
    };

    return fetch(signed_url, requestOptions)
        .then(response => {
            if(response.ok) {
                console.log(response);
                return "File uploaded successfully";
            } else {
                throw new Error("File upload failed");
            }
        });
}