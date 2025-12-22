import { AllProvidersFailedError } from '@lido-nestjs/execution';
import { LoggerService } from '@nestjs/common';

interface RangeTask {
  start: number;
  end: number;
}

type RangeOutcome<E> =
  | { type: 'data'; events: E[] }
  | { type: 'split'; left: RangeTask; right: RangeTask };

function canSplitRange(task: RangeTask): boolean {
  return task.end - task.start > 1;
}

function splitRange(task: RangeTask): {
  left: RangeTask;
  right: RangeTask;
  center: number;
} {
  const center = Math.ceil((task.start + task.end) / 2);
  return {
    center,
    left: { start: task.start, end: center - 1 },
    right: { start: center, end: task.end },
  };
}

function appendEvents<E>(target: E[], events: E[]): void {
  // Push items one by one to avoid creating a temporary array with spread/concat on large batches.
  for (let i = 0; i < events.length; i++) {
    target.push(events[i]);
  }
}

async function fetchRangeOrSplit<
  E,
  T extends { events: E[]; startBlock: number; endBlock: number },
>(
  task: RangeTask,
  fetcher: (startBlock: number, endBlock: number) => Promise<T>,
  logger?: LoggerService,
): Promise<RangeOutcome<E>> {
  try {
    const data = await fetcher(task.start, task.end);

    logger?.debug?.('Range fetched successfully', {
      start: task.start,
      end: task.end,
      eventsCount: data.events.length,
    });

    return { type: 'data', events: data.events };
  } catch (error: unknown) {
    if (error instanceof AllProvidersFailedError && canSplitRange(task)) {
      const { left, right, center } = splitRange(task);

      logger?.debug?.('Splitting range due to provider failure', {
        start: task.start,
        end: task.end,
        center,
      });

      return { type: 'split', left, right };
    }

    logger?.error?.('Failed to fetch range', {
      start: task.start,
      end: task.end,
      error: error instanceof Error ? error.message : error,
    });

    throw error;
  }
}

export async function fetchEventsFallOver<
  E,
  T extends { events: E[]; startBlock: number; endBlock: number },
>(
  startBlock: number,
  endBlock: number,
  fetcher: (startBlock: number, endBlock: number) => Promise<T>,
  logger?: LoggerService,
): Promise<{ events: E[]; startBlock: number; endBlock: number }> {
  if (startBlock > endBlock) {
    return { events: [], startBlock, endBlock };
  }

  const allEvents: E[] = [];
  const stack: RangeTask[] = [{ start: startBlock, end: endBlock }];

  let task: RangeTask | undefined;
  while ((task = stack.pop()) !== undefined) {
    const outcome = await fetchRangeOrSplit<E, T>(task, fetcher, logger);

    if (outcome.type === 'data') {
      appendEvents(allEvents, outcome.events);
      continue;
    }

    stack.push(outcome.right);
    stack.push(outcome.left);
  }

  return { events: allEvents, startBlock, endBlock };
}
