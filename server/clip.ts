import Replicate from "replicate";

const replicate = new Replicate({
  auth: Deno.env.get("REPLICATE_API_TOKEN"),
});

interface ReplicateOutput {
  input_type: string;
  input: string;
  embedding: number[];
}

export async function getImageEmbedding(
  imageLocation: string,
) {
  return await replicate.run(
    "weldawadyathink/mobileclip:f3abf71398b6560d9fe293a71a7a76f67b5ad2249b3d6e26ac65d61bba4e8db7",
    {
      input: {
        image: imageLocation,
      },
    },
  ) as ReplicateOutput;
}

export async function getTextEmbedding(
  input: string,
) {
  return await replicate.run(
    "weldawadyathink/mobileclip:f3abf71398b6560d9fe293a71a7a76f67b5ad2249b3d6e26ac65d61bba4e8db7",
    {
      input: {
        text: input,
      },
    },
  ) as ReplicateOutput;
}

if (import.meta.main) {
  const result = await getTextEmbedding("Hello World!");
  console.log(result);
  const imgresult = await getImageEmbedding(
    "https://audiobookcovers.global.ssl.fastly.net/file/com-audiobookcovers/optimized/f20d4fa2-82b0-4e5d-9921-d733b7789761.jpg",
  );
  console.log(imgresult);
}
