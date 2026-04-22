import type {
  AnyTask,
  TaskOutput,
  TaskPayload,
  TriggerOptions,
} from "@trigger.dev/sdk/v3";
import { batch } from "@trigger.dev/sdk/v3";

type TaskItem<T extends AnyTask> = {
  task: T;
  payload: TaskPayload<T>;
  options?: TriggerOptions;
};

export async function batchTriggerAndWait<T extends TaskItem<AnyTask>[]>(
  items: T,
): Promise<TaskOutput<T[number]["task"]>[]> {
  let unfinishedItems: TaskItem<T[number]["task"]>[] = items;
  const finishedItems: TaskOutput<T[number]["task"]>[] = [];
  const batchSizeLimit = 1000; // Defined by trigger.dev
  while (unfinishedItems.length > 0) {
    const batchItems = unfinishedItems.slice(0, batchSizeLimit);
    unfinishedItems = unfinishedItems.slice(batchSizeLimit);
    const { runs } = await batch.triggerByTaskAndWait(batchItems);
    finishedItems.push(
      ...runs.map((run) => {
        if (!run.ok) throw run.error;
        return run.output;
      }),
    );
  }
  return finishedItems;
}

export async function triggerAndWait<T extends AnyTask>(task: TaskItem<T>) {
  const result = await task.task.triggerAndWait(task.payload, task.options);
  if (!result.ok) {
    throw result.error;
  }
  return result.output;
}
