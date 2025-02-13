import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  type Processor,
  RawImage,
} from "@huggingface/transformers";

export const dimensions: number = 512;

export const models = {
  "Benny1923/metaclip-b16-fullcc2.5b": { dimensions: 512 },
  "Xenova/clip-vit-large-patch14": { dimensions: 768 },
  "Xenova/mobileclip_blt": { dimensions: 512 },
} as const;

export type ModelOptions = keyof typeof models;

const global = globalThis as unknown as {
  models: {
    [K in ModelOptions]?: {
      tokenizer: undefined | PreTrainedTokenizer;
      textModel: undefined | PreTrainedModel;
      processor: undefined | Processor;
      visionModel: undefined | PreTrainedModel;
    };
  };
};

function getGlobalModels(modelName: ModelOptions) {
  if (!global.models) {
    global.models = {};
  }
  if (!global.models[modelName]) {
    global.models[modelName] = {
      tokenizer: undefined,
      textModel: undefined,
      processor: undefined,
      visionModel: undefined,
    };
  }
  return global.models[modelName];
}

async function getTextModel(modelName: ModelOptions): Promise<{
  tokenizer: PreTrainedTokenizer;
  textModel: PreTrainedModel;
}> {
  let { tokenizer, textModel } = getGlobalModels(modelName);
  if (!tokenizer) {
    tokenizer = await AutoTokenizer.from_pretrained(modelName);
    global.models[modelName]!.tokenizer = tokenizer;
    console.log(`Loaded tokenizer for ${modelName} into memory`);
  }
  if (!textModel) {
    textModel = await CLIPTextModelWithProjection.from_pretrained(modelName, {
      dtype: "fp32",
    });
    global.models[modelName]!.textModel = textModel;
    console.log(`Loaded text model for ${modelName} into memory`);
  }
  return {
    tokenizer,
    textModel,
  };
}

async function getVisionModel(modelName: ModelOptions): Promise<{
  processor: Processor;
  visionModel: PreTrainedModel;
}> {
  let { processor, visionModel } = getGlobalModels(modelName);
  if (!processor) {
    processor = await AutoProcessor.from_pretrained(modelName, {});
    global.models[modelName]!.processor = processor;
    console.log(`Loaded image processor for ${modelName} into memory`);
  }
  if (!visionModel) {
    visionModel = await CLIPVisionModelWithProjection.from_pretrained(
      modelName,
      { dtype: "fp32" },
    );
    global.models[modelName]!.visionModel = visionModel;
    console.log(`Loaded vision model for ${modelName} into memory`);
  }
  return {
    processor,
    visionModel,
  };
}

export async function getImageEmbedding(
  imageLocation: string,
  modelName: ModelOptions,
) {
  const image = await RawImage.read(imageLocation);
  const { processor, visionModel } = await getVisionModel(modelName);
  const imageInputs = await processor(image);
  const { image_embeds } = await visionModel(imageInputs);
  return [...image_embeds.normalize().data] as Array<number>;
}

export async function getTextEmbedding(
  input: string,
  modelName: ModelOptions,
) {
  const { tokenizer, textModel } = await getTextModel(modelName);
  const tokens = tokenizer(input, { padding: "max_length", truncation: true });
  const { text_embeds } = await textModel(tokens);
  return [...text_embeds.normalize().data] as Array<number>;
}

async function tests() {
  for (const modelName of Object.keys(models)) {
    let result: any = null;

    result = await getImageEmbedding(
      "./test_image.png",
      modelName as ModelOptions,
    );
    console.log(
      `Embedding created with ${modelName}. ${result.length} dimensions. First value: ${
        result[0]
      }`,
    );

    result = await getImageEmbedding(
      "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/football-match.jpg",
      modelName as ModelOptions,
    );
    console.log(
      `Embedding created with ${modelName}. ${result.length} dimensions. First value: ${
        result[0]
      }`,
    );

    result = await getTextEmbedding(
      "Hello World!",
      modelName as ModelOptions,
    );
    console.log(
      `Embedding created with ${modelName}. ${result.length} dimensions. First value: ${
        result[0]
      }`,
    );
  }
}

// await tests();
