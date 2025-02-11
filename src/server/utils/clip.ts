const quantized = false; // change to `true` for a much smaller model (e.g. 87mb vs 345mb for image model), but lower accuracy
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPModel,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
} from "npm:@huggingface/transformers";

export const dimensions: number = 512;

const model_id = "Marqo/marqo-fashionCLIP";

const tokenizer = await AutoTokenizer.from_pretrained(model_id);
console.log("loaded tokenizer into memory");
const text_model = await CLIPTextModelWithProjection.from_pretrained(
  model_id,
  { dtype: "fp32" },
);
console.log("loaded text_model into memory");

const processor = await AutoProcessor.from_pretrained(model_id, {});
console.log("Loaded processor into memory");
const vision_model = await CLIPVisionModelWithProjection.from_pretrained(
  model_id,
  { dtype: "fp32" },
);
console.log("loaded vision_model into memory");

export async function getImageEmbedding(imageLocation: string) {
  const image = await RawImage.read(imageLocation);
  const imageInputs = await processor(image);
  const { image_embeds } = await vision_model(imageInputs);
  return image_embeds.normalize().data;
}

export async function getTextEmbedding(input: string) {
  const tokens = tokenizer(input, { padding: "max_length", truncation: true });
  const { text_embeds } = await text_model(tokens);
  return text_embeds.normalize().data;
}

async function tests() {
  let result: any = null;
  console.log("Generating embedding for local image file");
  result = await getImageEmbedding("./test_image.png");
  console.log(
    `Embedding created with ${result.length} dimensions. First value: ${
      result[0]
    }`,
  );

  console.log("Generating embedding for remote image file");
  result = await getImageEmbedding(
    "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/football-match.jpg",
  );
  console.log(
    `Embedding created with ${result.length} dimensions. First value: ${
      result[0]
    }`,
  );

  console.log("Generating embedding for string");
  result = await getTextEmbedding("Hello World!");
  console.log(
    `Embedding created with ${result.length} dimensions. First value: ${
      result[0]
    }`,
  );
}

await tests();
