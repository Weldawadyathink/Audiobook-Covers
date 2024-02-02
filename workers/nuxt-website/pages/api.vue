<template>
  <div class="m-6">
    <a href="/openapi.yaml">OpenAPI Specification</a>
    <h2>Overview</h2>
    <p>
      The Audiobook Covers API provides a simple interface to search for
      audiobook covers based on the text in the cover image. It has one primary
      endpoint:
    </p>
    <ul>
      <li><code>GET /cover/bytext/</code></li>
    </ul>

    <h2>API Endpoint</h2>

    <h3>GET /cover/bytext/</h3>
    <p>
      This endpoint retrieves a list of audiobook covers that match the
      specified search text.
    </p>
    <h4>Request Parameters</h4>
    <table>
      <thead>
        <tr>
          <th>Parameter</th>
          <th>Type</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>q</td>
          <td>string</td>
          <td>Search query based on the text in the cover image. (required)</td>
        </tr>
      </tbody>
    </table>
    <h4>Response</h4>
    <p>
      The response is a JSON array of objects, each containing the following
      properties:
    </p>
    <table>
      <thead>
        <tr>
          <th>Property</th>
          <th>Type</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>filename</td>
          <td>string</td>
          <td>URL of the audiobook cover image.</td>
        </tr>
        <tr>
          <td>source</td>
          <td>string</td>
          <td>URL for the source of the image.</td>
        </tr>
      </tbody>
    </table>
    <h4>Example Request</h4>
    <pre>
GET https://api.audiobookcovers.com/cover/bytext/?q=harry%20potter
    </pre>
    <h4>Example Response</h4>
    <pre>
[
  {
    "filename": "https://r2.audiobookcovers.com/covers/xyz789",
    "source": "https://redd.it/abc123"
  },
  {
    "filename": "https://r2.audiobookcovers.com/covers/uvw012",
    "source": "https://redd.it/def456"
  }
]
    </pre>

    <h3>GET /cover/byredditpostid/</h3>
    <p>
      This endpoint retrieves a list of audiobook covers based on the specified
      Reddit post ID.
    </p>
    <h4>Request Parameters</h4>
    <table>
      <thead>
        <tr>
          <th>Parameter</th>
          <th>Type</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>q</td>
          <td>string</td>
          <td>Reddit post ID for the audiobook cover. (required)</td>
        </tr>
      </tbody>
    </table>
    <h4>Response</h4>
    <p>
      The response is a JSON array of objects, each containing the following
      properties:
    </p>
    <table>
      <thead>
        <tr>
          <th>Property</th>
          <th>Type</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>filename</td>
          <td>string</td>
          <td>URL of the audiobook cover image.</td>
        </tr>
        <tr>
          <td>source</td>
          <td>string</td>
          <td>URL for the source of the image.</td>
        </tr>
      </tbody>
    </table>
    <h4>Example Request</h4>
    <pre>
GET https://api.audiobookcovers.com/cover/byredditpostid/?q=abc123
    </pre>
    <h4>Example Response</h4>
    <pre>
[
  {
    "filename": "https://r2.audiobookcovers.com/covers/xyz789",
    "source": "https://redd.it/abc123"
  }
]
    </pre>
  </div>
</template>

<script>
export default {
  name: "API",
};
</script>

<style></style>
