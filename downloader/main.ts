import { copy, ensureDir, ensureFile, move } from "@std/fs";
import { pool, sql } from "./db.ts";
import { rmdir } from "node:fs/promises";
import { listFilesRecursively } from "./utils.ts";

const redditIds = await pool.manyFirst(
  sql.typeAlias("redditId")`
    SELECT DISTINCT
      REPLACE("source", 'https://reddit.com/', '') AS slug
    FROM
      image
    WHERE
      "source" LIKE 'https://reddit.com/%';
  `,
);
await ensureDir("./bdfr");
await Deno.writeTextFile("./bdfr/exclude_id.txt", redditIds.join("\n"));
console.log(redditIds);

console.log("Deno is running");
console.log("Starting bdfr downloader");
await ensureDir("./bdfr");
const bdfr = new Deno.Command("./.venv/bin/bdfr", {
  args: [
    "download",
    "./bdfr",
    "--log",
    "./bdfr.log.txt",
    "--subreddit",
    "audiobookcovers",
    "--limit",
    "5",
    "--sort",
    "new",
    "--file-scheme",
    "{POSTID}",
    "--exclude-id-file",
    "exclude_id.txt",
  ],
});
// const { success } = await bdfr.output();
console.log(await listFilesRecursively("./bdfr"));
