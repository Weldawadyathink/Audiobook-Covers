/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
  async fetch(request, env, ctx) {
    // Parse the request to FormData
    const formData = await request.formData();
    // Get the File from the form. Key for the file is 'image' for me
    const file = formData.get('file');

    const hash = await sha1(file);

    await env.bucket.put(file.name, file)

    return new Response(JSON.stringify({
      name: file.name,
      type: file.type,
      size: file.size,
      hash,
    }));
  },
};

async function sha1(file) {
  const fileData = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-1', fileData);
  const array = Array.from(new Uint8Array(digest));
  const sha1 =  array.map(b => b.toString(16).padStart(2, '0')).join('')
  return sha1;
}
