import { AllProvidersFailedError } from '@lido-nestjs/execution';
import { LoggerService } from '@nestjs/common';

interface RangeTask {
  start: number;
  end: number;
}

function canSplitEventsRange(task: RangeTask): boolean {
  return task.end - task.start > 1;
}

function splitEventsRange(task: RangeTask): {
  left: RangeTask;
  right: RangeTask;
} {
  const center = Math.ceil((task.start + task.end) / 2);
  return {
    left: { start: task.start, end: center - 1 },
    right: { start: center, end: task.end },
  };
}

function shouldSplitEventsRange(error: unknown, task: RangeTask): boolean {
  return error instanceof AllProvidersFailedError && canSplitEventsRange(task);
}

/**
 * Fetches events in the given block range with automatic range splitting on provider failure.
 *
 * When AllProvidersFailedError occurs (all providers exhausted their retries),
 * the range is split in half and retried. This handles cases where the range
 * is too large for the provider to handle.
 *
 * Note: startBlock > endBlock is valid - contract.queryFilter returns an empty
 * array in this case, which happens when the cache is already up to date.
 */
export async function fetchEventsFallOver<
  E,
  T extends { events: E[]; startBlock: number; endBlock: number },
>(
  startBlock: number,
  endBlock: number,
  fetcher: (startBlock: number, endBlock: number) => Promise<T>,
  logger?: LoggerService,
): Promise<{ events: E[]; startBlock: number; endBlock: number }> {
  const allEvents: E[] = [];
  const stack: RangeTask[] = [{ start: startBlock, end: endBlock }];

  let task: RangeTask | undefined;
  let requestCount = 0;

  while ((task = stack.pop()) !== undefined) {
    requestCount++;
    const fetchStartTime = Date.now();

    logger?.log?.('Starting fetch for range', {
      start: task.start,
      end: task.end,
      stackSize: stack.length,
      requestCount,
    });

    try {
      const { events } = await fetcher(task.start, task.end);
      const fetchDuration = Date.now() - fetchStartTime;

      for (const event of events) {
        allEvents.push(event);
      }

      logger?.log?.('Fetched range successfully', {
        start: task.start,
        end: task.end,
        count: events.length,
        totalEvents: allEvents.length,
        durationMs: fetchDuration,
      });
    } catch (error: unknown) {
      const fetchDuration = Date.now() - fetchStartTime;

      if (!shouldSplitEventsRange(error, task)) {
        logger?.error?.('Failed to fetch range', {
          start: task.start,
          end: task.end,
          error: error instanceof Error ? error.message : error,
          durationMs: fetchDuration,
        });
        throw error;
      }

      const { left, right } = splitEventsRange(task);
      stack.push(right);
      stack.push(left);

      logger?.warn?.('Splitting range due to provider failure', {
        start: task.start,
        end: task.end,
        newRanges: { left, right },
        durationMs: fetchDuration,
      });
    }
  }

  return { events: allEvents, startBlock, endBlock };
}
