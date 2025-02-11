const quantized = false; // change to `true` for a much smaller model (e.g. 87mb vs 345mb for image model), but lower accuracy
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
} from "npm:@huggingface/transformers";

export const dimensions: number = 512;

const imageProcessor = await AutoProcessor.from_pretrained(
  "Xenova/clip-vit-base-patch16",
);
const visionModel = await CLIPVisionModelWithProjection.from_pretrained(
  "Xenova/clip-vit-base-patch16",
);
const tokenizer = await AutoTokenizer.from_pretrained(
  "Xenova/clip-vit-base-patch16",
);
const textModel = await CLIPTextModelWithProjection.from_pretrained(
  "Xenova/clip-vit-base-patch16",
);

function cosineSimilarity(A: number[], B: number[]) {
  if (A.length !== B.length) throw new Error("A.length !== B.length");
  let dotProduct = 0,
    mA = 0,
    mB = 0;
  for (let i = 0; i < A.length; i++) {
    dotProduct += A[i] * B[i];
    mA += A[i] * A[i];
    mB += B[i] * B[i];
  }
  mA = Math.sqrt(mA);
  mB = Math.sqrt(mB);
  const similarity = dotProduct / (mA * mB);
  return similarity;
}

export async function getImageEmbedding(imageLocation: string) {
  const image = await RawImage.read(imageLocation);
  const imageInputs = await imageProcessor(image);
  const { image_embeds } = await visionModel(imageInputs);
  return image_embeds.data;
}

async function tests() {
  console.log("Generating embedding for local image file");
  const result = await getImageEmbedding("./test_image.png");
  console.log(
    `Embedding created with ${result.length} dimensions. First value: ${
      result[0]
    }`,
  );
}

await tests();
