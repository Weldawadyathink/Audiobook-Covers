import type {
  AnyTask,
  TaskOutput,
  TaskPayload,
  TriggerOptions,
} from "@trigger.dev/sdk/v3";
import { batch } from "@trigger.dev/sdk/v3";

type BatchItem<TTask extends AnyTask> = {
  task: TTask;
  payload: TaskPayload<TTask>;
  options?: TriggerOptions;
};

type AnyBatchItem = BatchItem<AnyTask>;

type BatchOutputs<T extends readonly AnyBatchItem[]> = {
  [K in keyof T]: T[K] extends BatchItem<infer TTask>
    ? TaskOutput<TTask>
    : never;
};

export async function batchTriggerAndWait<T extends readonly AnyBatchItem[]>(
  items: T,
): Promise<BatchOutputs<T>> {
  // BatchByTaskAndWaitItem is not publicly exported, so we cast to any here.
  // The runtime shape matches: { task, payload, options? }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let unfinishedItems: readonly AnyBatchItem[] = items;
  const finishedItems: unknown[] = [];
  const batchSizeLimit = 1000;
  while (unfinishedItems.length > 0) {
    const batchItems = unfinishedItems.slice(0, batchSizeLimit);
    unfinishedItems = unfinishedItems.slice(batchSizeLimit);
    const { runs } = await batch.triggerByTaskAndWait(batchItems as any);
    finishedItems.push(
      ...runs.map((run) => {
        if (!run.ok) throw run.error;
        return run.output;
      }),
    );
  }
  return finishedItems as BatchOutputs<T>;
}

export async function triggerAndWait<TTask extends AnyTask>(
  task: TTask,
  payload: TaskPayload<TTask>,
  options?: TriggerOptions,
): Promise<TaskOutput<TTask>> {
  const result = await task.triggerAndWait(payload, options);
  if (!result.ok) {
    throw result.error;
  }
  return result.output;
}
