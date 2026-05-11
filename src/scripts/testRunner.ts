import { Command } from "commander";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod/v4";
import { vectorSearchByString } from "@/server/imageSearcherAI";
import "dotenv/config";
import { logger } from "@/logger";

logger.setLogLevel("disabled");

const rrfModelEntrySchema = z.object({
  model: z.string(),
  k: z.number().default(60),
  weight: z.number().default(1),
});

const rrfConfigSchema = z.object({
  name: z.string(),
  models: z.array(rrfModelEntrySchema).min(2),
});

const testConfigSchema = z.object({
  models: z.array(z.string()).default([]),
  rrfConfigs: z.array(rrfConfigSchema).default([]),
  searches: z
    .array(
      z.object({
        query: z.string().min(1),
        expectedUuids: z.array(z.string()).min(1),
      }),
    )
    .min(1),
});

const program = new Command();
program
  .option("-c, --config <path>", "Path to test config JSON", "test-runner.json")
  .option(
    "-o, --output <path>",
    "Path to output CSV",
    "search-test-results.csv",
  );
program.parse(process.argv);
const opts = program.opts();

const config = testConfigSchema.parse(
  JSON.parse(readFileSync(opts.config, "utf-8")),
);

function computeMetrics(resultIds: string[], expectedUuids: string[]) {
  const ranks = expectedUuids.map((uuid) => {
    const idx = resultIds.findIndex(
      (id) => id.toLowerCase() === uuid.toLowerCase(),
    );
    return idx === -1 ? resultIds.length + 1 : idx + 1;
  });
  const missing = ranks.filter((r) => r === resultIds.length + 1).length;
  // Average Precision: rewards all expected results appearing early
  const sortedRanks = [...ranks].sort((a, b) => a - b);
  const ap =
    sortedRanks.reduce((sum, rank, i) => sum + (i + 1) / rank, 0) /
    expectedUuids.length;
  const meanRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
  const maxRank = Math.max(...ranks);
  return { ap, meanRank, maxRank, missing };
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function toCsvRow(fields: (string | number)[]) {
  return fields.map(csvEscape).join(",");
}

type QueryRow = {
  configName: string;
  configType: string;
  query: string;
  ap: number;
  meanRank: number;
  maxRank: number;
  missing: number;
};

const rows: QueryRow[] = [];

for (const search of config.searches) {
  console.log(
    `Running ${config.models.length + config.rrfConfigs.length} configs for query="${search.query}"`,
  );
  const batchResults = await Promise.all([
    ...config.models.map(async (modelName) => {
      console.log(`  [single] model=${modelName}`);
      const results = await vectorSearchByString({
        data: { q: search.query, model: modelName },
      });
      return {
        configName: modelName,
        configType: "single",
        query: search.query,
        ...computeMetrics(
          results.map((r) => r.id),
          search.expectedUuids,
        ),
      } satisfies QueryRow;
    }),
    ...config.rrfConfigs.map(async (rrfConfig) => {
      console.log(`  [rrf] name=${rrfConfig.name}`);
      const resolvedModels = rrfConfig.models.map((m) => ({
        model: m.model,
        k: m.k,
        weight: m.weight,
      }));
      const results = await vectorSearchByString({
        data: { q: search.query, model: resolvedModels },
      });
      return {
        configName: rrfConfig.name,
        configType: "rrf",
        query: search.query,
        ...computeMetrics(
          results.map((r) => r.id),
          search.expectedUuids,
        ),
      } satisfies QueryRow;
    }),
  ]);
  rows.push(...batchResults);
}

const configNames = [...new Set(rows.map((r) => r.configName))];
const aggregates: QueryRow[] = configNames.map((name) => {
  const group = rows.filter((r) => r.configName === name);
  const mean = (key: keyof QueryRow) =>
    group.reduce((s, r) => s + (r[key] as number), 0) / group.length;
  return {
    configName: name,
    configType: group[0].configType,
    query: "[AGGREGATE]",
    ap: mean("ap"),
    meanRank: mean("meanRank"),
    maxRank: mean("maxRank"),
    missing: group.reduce((s, r) => s + r.missing, 0),
  };
});

const header = "configName,configType,query,ap,meanRank,maxRank,missing";
const formatRow = (r: QueryRow) =>
  toCsvRow([
    r.configName,
    r.configType,
    r.query,
    r.ap.toFixed(4),
    r.meanRank.toFixed(2),
    r.maxRank.toFixed(0),
    r.missing.toFixed(0),
  ]);
const csvLines = [header, ...aggregates.map(formatRow), ...rows.map(formatRow)];

writeFileSync(opts.output, csvLines.join("\n") + "\n");
console.log(`\nResults written to ${opts.output}`);
