import Replicate from "replicate";
import { ModelDefinition } from "./search";
import { z } from "zod/v4";
import { env } from "@/env.cloudflare";

function getReplicate(runtimeEnv?: Cloudflare.Env) {
  return new Replicate({
    auth: runtimeEnv?.REPLICATE_API_TOKEN ?? env.REPLICATE_API_TOKEN,
  });
}

const replicateClipOutputValidator = z
  .array(
    z.object({
      embedding: z.array(z.coerce.number()),
      input: z.coerce.string(),
    }),
  )
  .min(1);

export const models = {
  "andreasjansson-clip": {
    dimensions: 768,
    dbColumn: "embedding_andreasjansson_clip",
    getTextEmbedding: async (input, env) => {
      const replicate = getReplicate(env);
      const result = await replicate.run(
        "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
        {
          input: {
            inputs: input,
          },
        },
      );
      const validatedResult = replicateClipOutputValidator.parse(result);
      return validatedResult[0];
    },
    getImageEmbedding: async (input, env) => {
      const replicate = getReplicate(env);
      const result = await replicate.run(
        "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
        {
          input: {
            inputs: input,
          },
        },
      );
      const validatedResult = replicateClipOutputValidator.parse(result);
      return validatedResult[0];
    },
    getImageEmbeddings: async (inputs, env) => {
      const replicate = getReplicate(env);
      const results = await Promise.all(
        inputs.map((input) =>
          replicate.run(
            "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
            {
              input: {
                inputs: input,
              },
            },
          ),
        ),
      );
      const validatedResults = results.map((r) =>
        replicateClipOutputValidator.parse(r),
      );
      return validatedResults.map((r) => r[0]);
    },
  },
} satisfies Record<string, ModelDefinition>;
