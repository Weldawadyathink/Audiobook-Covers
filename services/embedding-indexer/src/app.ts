import { reindex } from "./reindex";
import { CronJob } from "cron";

const job = CronJob.from({
  cronTime: "0 */15 * * * *",
  onTick: reindex,
  start: true,
  runOnInit: true,
});
