import Replicate from "replicate";

interface ReplicateClipReturnObject {
  input: string;
  embedding: Array<number>;
}

export async function runSingleClip(input: string) {
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });
  const [output] = (await replicate.run(
    "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
    {
      input: {
        inputs: input,
      },
    },
  )) as Array<ReplicateClipReturnObject>;
  return output!;
}
