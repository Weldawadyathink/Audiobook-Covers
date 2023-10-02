
export default {
  async fetch(request, env, ctx) {
    const formData = await request.formData();
    const file = formData.get('file');

    const annotation = await annotateImage(file, env.gcloud_api_key);

    // await env.bucket.put(file.name, file)

    return new Response(annotation);
  },
};

function extractAnnotationText(annotation) {
  const text =  annotation.responses[0].textAnnotations[0].description;
  const removedNewlines = text.replace(/\n/g, ' ');
  return removedNewlines;
}

async function annotateImage(imageFile, apiKey) {
  const buffer = await imageFile.arrayBuffer();
  const image = Buffer.from(buffer).toString('base64');
  const endpoint = 'https://vision.googleapis.com/v1/images:annotate';
  const requestPayload = {
    requests: [
      {
        image: {
          content: image
        },
        features: [
          {
            type: 'TEXT_DETECTION'
          }
        ]
      }
    ]
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return extractAnnotationText(data);

  } catch (error) {
    console.error('Error:', error);
  }
}
