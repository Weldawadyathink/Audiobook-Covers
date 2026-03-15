import { Command } from "commander";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod/v4";
import { vectorSearchByString } from "@/server/imageSearcher";
import "dotenv/config";

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
  const expectedSet = new Set(expectedUuids.map((u) => u.toLowerCase()));
  let rr = 0;
  for (let i = 0; i < resultIds.length; i++) {
    if (expectedSet.has(resultIds[i].toLowerCase())) {
      rr = 1 / (i + 1);
      break;
    }
  }
  const top10 = new Set(resultIds.slice(0, 10).map((u) => u.toLowerCase()));
  const top20 = new Set(resultIds.slice(0, 20).map((u) => u.toLowerCase()));
  const hitsAt10 =
    [...expectedSet].filter((u) => top10.has(u)).length / expectedUuids.length;
  const hitsAt20 =
    [...expectedSet].filter((u) => top20.has(u)).length / expectedUuids.length;
  const ranks = expectedUuids.map((uuid) => {
    const idx = resultIds.findIndex(
      (id) => id.toLowerCase() === uuid.toLowerCase(),
    );
    return idx === -1 ? resultIds.length + 1 : idx + 1;
  });
  const avgRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
  return { rr, hitsAt10, hitsAt20, avgRank };
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
  rr: number;
  hitsAt10: number;
  hitsAt20: number;
  avgRank: number;
  latencyMs: number;
};

const rows: QueryRow[] = [];

for (const modelName of config.models) {
  for (const search of config.searches) {
    console.log(`[single] model=${modelName} query="${search.query}"`);
    const t0 = performance.now();
    const results = await vectorSearchByString({
      data: { q: search.query, model: modelName },
    });
    const latencyMs = performance.now() - t0;
    const ids = results.map((r) => r.id);
    const metrics = computeMetrics(ids, search.expectedUuids);
    rows.push({
      configName: modelName,
      configType: "single",
      query: search.query,
      latencyMs,
      ...metrics,
    });
  }
}

for (const rrfConfig of config.rrfConfigs) {
  const resolvedModels = rrfConfig.models.map((m) => ({
    model: m.model,
    k: m.k,
    weight: m.weight,
  }));
  for (const search of config.searches) {
    console.log(`[rrf] name=${rrfConfig.name} query="${search.query}"`);
    const t0 = performance.now();
    const results = await vectorSearchByString({
      data: { q: search.query, model: resolvedModels },
    });
    const latencyMs = performance.now() - t0;
    const ids = results.map((r) => r.id);
    const metrics = computeMetrics(ids, search.expectedUuids);
    rows.push({
      configName: rrfConfig.name,
      configType: "rrf",
      query: search.query,
      latencyMs,
      ...metrics,
    });
  }
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
    rr: mean("rr"),
    hitsAt10: mean("hitsAt10"),
    hitsAt20: mean("hitsAt20"),
    avgRank: mean("avgRank"),
    latencyMs: mean("latencyMs"),
  };
});

const header = "configName,configType,query,rr,hitsAt10,hitsAt20,avgRank,latencyMs";
const csvLines = [
  header,
  ...rows.map((r) =>
    toCsvRow([
      r.configName,
      r.configType,
      r.query,
      r.rr.toFixed(4),
      r.hitsAt10.toFixed(4),
      r.hitsAt20.toFixed(4),
      r.avgRank.toFixed(2),
      r.latencyMs.toFixed(1),
    ]),
  ),
  ...aggregates.map((r) =>
    toCsvRow([
      r.configName,
      r.configType,
      r.query,
      r.rr.toFixed(4),
      r.hitsAt10.toFixed(4),
      r.hitsAt20.toFixed(4),
      r.avgRank.toFixed(2),
      r.latencyMs.toFixed(1),
    ]),
  ),
];

writeFileSync(opts.output, csvLines.join("\n") + "\n");
console.log(`\nResults written to ${opts.output}`);
