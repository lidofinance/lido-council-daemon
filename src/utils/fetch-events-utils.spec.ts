import { AllProvidersFailedError } from '@lido-nestjs/execution';
import { fetchEventsFallOver } from './fetch-events-utils';

type TestEvent = { block: number; data: string };
type FetchResult = {
  events: TestEvent[];
  startBlock: number;
  endBlock: number;
};

type FailurePattern = {
  name: string;
  shouldFail: (start: number, end: number, callIndex: number) => boolean;
};

const createFetcher = (
  impl: (start: number, end: number) => Promise<FetchResult>,
) => jest.fn(impl);

const createSuccessFetcher = (eventsPerBlock = 1) =>
  createFetcher(async (start, end) => {
    const events: TestEvent[] = [];
    for (let block = start; block <= end; block++) {
      for (let i = 0; i < eventsPerBlock; i++) {
        events.push({ block, data: `event-${block}-${i}` });
      }
    }
    return { events, startBlock: start, endBlock: end };
  });

const createEventsForRange = (start: number, end: number): TestEvent[] => {
  const events: TestEvent[] = [];
  for (let block = start; block <= end; block++) {
    events.push({ block, data: `event-${block}` });
  }
  return events;
};

const createPatternFetcher = (pattern: FailurePattern) => {
  let callIndex = 0;
  return createFetcher(async (start, end) => {
    const shouldFail = pattern.shouldFail(start, end, callIndex++);
    if (shouldFail) {
      throw new AllProvidersFailedError(`Failed: ${pattern.name}`);
    }
    return {
      events: createEventsForRange(start, end),
      startBlock: start,
      endBlock: end,
    };
  });
};

describe('fetchEventsFallOver', () => {
  describe('basic success cases', () => {
    it('should fetch events for a simple range', async () => {
      const fetcher = createSuccessFetcher();
      const result = await fetchEventsFallOver(0, 5, fetcher);

      expect(result.startBlock).toBe(0);
      expect(result.endBlock).toBe(5);
      expect(result.events).toHaveLength(6);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledWith(0, 5);
    });

    it('should handle inverted range (startBlock > endBlock)', async () => {
      // contract.queryFilter returns empty array for inverted ranges
      const fetcher = createFetcher(async (start, end) => ({
        events: [],
        startBlock: start,
        endBlock: end,
      }));
      const result = await fetchEventsFallOver(10, 5, fetcher);

      expect(result.events).toEqual([]);
      expect(result.startBlock).toBe(10);
      expect(result.endBlock).toBe(5);
      expect(fetcher).toHaveBeenCalledWith(10, 5);
    });

    it('should handle single block range', async () => {
      const fetcher = createSuccessFetcher();
      const result = await fetchEventsFallOver<TestEvent, FetchResult>(
        5,
        5,
        fetcher,
      );

      expect(result.events).toHaveLength(1);
      expect(result.events[0].block).toBe(5);
    });

    it('should handle range with no events', async () => {
      const fetcher = createFetcher(async (start, end) => ({
        events: [],
        startBlock: start,
        endBlock: end,
      }));
      const result = await fetchEventsFallOver(0, 100, fetcher);

      expect(result.events).toEqual([]);
    });
  });

  describe('AllProvidersFailedError handling', () => {
    it('should split range on AllProvidersFailedError', async () => {
      let callCount = 0;
      const fetcher = createFetcher(async (start, end) => {
        callCount++;
        if (callCount === 1) {
          throw new AllProvidersFailedError('All providers failed');
        }
        return {
          events: [{ block: start, data: 'event' }],
          startBlock: start,
          endBlock: end,
        };
      });

      const result = await fetchEventsFallOver(0, 10, fetcher);

      expect(result.events.length).toBeGreaterThan(0);
      expect(fetcher).toHaveBeenCalledTimes(3); // 1 failed + 2 split ranges
    });

    it('should keep splitting until ranges succeed', async () => {
      const failedRanges = new Set<string>();
      const fetcher = createFetcher(async (start, end) => {
        const key = `${start}-${end}`;
        if (end - start > 2 && !failedRanges.has(key)) {
          failedRanges.add(key);
          throw new AllProvidersFailedError('Range too large');
        }
        const events: TestEvent[] = [];
        for (let block = start; block <= end; block++) {
          events.push({ block, data: `event-${block}` });
        }
        return { events, startBlock: start, endBlock: end };
      });

      const result = await fetchEventsFallOver<TestEvent, FetchResult>(
        0,
        100,
        fetcher,
      );

      const blocks = result.events.map((e) => e.block);
      expect(blocks).toHaveLength(101);
    });

    it('should throw if range cannot be split further', async () => {
      const error = new AllProvidersFailedError('All providers failed');
      const fetcher = createFetcher(async () => {
        throw error;
      });

      await expect(fetchEventsFallOver(5, 6, fetcher)).rejects.toThrow(
        AllProvidersFailedError,
      );
    });
  });

  describe('non-AllProvidersFailedError handling', () => {
    it('should throw non-AllProvidersFailedError immediately', async () => {
      const error = new Error('Some other error');
      const fetcher = createFetcher(async () => {
        throw error;
      });

      await expect(fetchEventsFallOver(0, 100, fetcher)).rejects.toThrow(
        'Some other error',
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('should not split on non-AllProvidersFailedError', async () => {
      const fetcher = createFetcher(async () => {
        throw new Error('Network error');
      });

      await expect(fetchEventsFallOver(0, 100, fetcher)).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });

  describe('events ordering', () => {
    it('should preserve event order after splits', async () => {
      let firstCall = true;
      const fetcher = createFetcher(async (start, end) => {
        if (firstCall && end - start > 5) {
          firstCall = false;
          throw new AllProvidersFailedError('Range too large');
        }
        const events: TestEvent[] = [];
        for (let block = start; block <= end; block++) {
          events.push({ block, data: `event-${block}` });
        }
        return { events, startBlock: start, endBlock: end };
      });

      const result = await fetchEventsFallOver<TestEvent, FetchResult>(
        0,
        20,
        fetcher,
      );

      const blocks = result.events.map((e) => e.block);
      for (let i = 1; i < blocks.length; i++) {
        expect(blocks[i]).toBeGreaterThanOrEqual(blocks[i - 1]);
      }
    });

    it('should collect events from all split ranges', async () => {
      const fetcher = createFetcher(async (start, end) => {
        if (end - start > 3) {
          throw new AllProvidersFailedError('Range too large');
        }
        const events: TestEvent[] = [];
        for (let block = start; block <= end; block++) {
          events.push({ block, data: `event-${block}` });
        }
        return { events, startBlock: start, endBlock: end };
      });

      const result = await fetchEventsFallOver<TestEvent, FetchResult>(
        0,
        15,
        fetcher,
      );

      expect(result.events).toHaveLength(16);
      const uniqueBlocks = new Set(result.events.map((e) => e.block));
      expect(uniqueBlocks.size).toBe(16);
    });
  });

  describe('logger integration', () => {
    it('should call logger.debug on success', async () => {
      const logger = {
        debug: jest.fn(),
        error: jest.fn(),
      };

      const fetcher = createSuccessFetcher();
      await fetchEventsFallOver(0, 5, fetcher, logger as any);

      expect(logger.debug).toHaveBeenCalledWith(
        'Fetched range',
        expect.objectContaining({ start: 0, end: 5 }),
      );
    });

    it('should call logger.debug on split', async () => {
      const logger = {
        debug: jest.fn(),
        error: jest.fn(),
      };

      let callCount = 0;
      const fetcher = createFetcher(async (start, end) => {
        callCount++;
        if (callCount === 1) {
          throw new AllProvidersFailedError('All providers failed');
        }
        return {
          events: [],
          startBlock: start,
          endBlock: end,
        };
      });

      await fetchEventsFallOver(0, 10, fetcher, logger as any);

      expect(logger.debug).toHaveBeenCalledWith(
        'Splitting range',
        expect.objectContaining({ start: 0, end: 10 }),
      );
    });

    it('should call logger.error on failure', async () => {
      const logger = {
        debug: jest.fn(),
        error: jest.fn(),
      };

      const fetcher = createFetcher(async () => {
        throw new Error('Fatal error');
      });

      await expect(
        fetchEventsFallOver(0, 5, fetcher, logger as any),
      ).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch range',
        expect.objectContaining({ start: 0, end: 5 }),
      );
    });
  });

  /**
   * Matrix tests for split invariants
   *
   * Range [0, 10] splits as:
   *         [0,10]
   *        /      \
   *     [0,5]    [6,10]
   *    /    \    /    \
   *  [0,2] [3,5] [6,8] [9,10]
   *
   * Invariants to verify:
   * 1. All blocks are covered (no gaps)
   * 2. No duplicate blocks
   * 3. Events are ordered by block number
   * 4. Total events = endBlock - startBlock + 1
   */
  describe('matrix: split invariants', () => {
    const ranges = [
      { start: 0, end: 10, name: 'small range [0,10]' },
      { start: 0, end: 100, name: 'medium range [0,100]' },
      { start: 50, end: 150, name: 'offset range [50,150]' },
    ];

    const failurePatterns: FailurePattern[] = [
      {
        name: 'first call only',
        shouldFail: (_s, _e, idx) => idx === 0,
      },
      {
        name: 'first two calls',
        shouldFail: (_s, _e, idx) => idx < 2,
      },
      {
        name: 'ranges larger than 20 blocks',
        shouldFail: (s, e) => e - s > 20,
      },
      {
        name: 'ranges larger than 5 blocks',
        shouldFail: (s, e) => e - s > 5,
      },
      {
        name: 'alternating calls',
        shouldFail: (_s, _e, idx) => idx % 2 === 0 && idx < 4,
      },
    ];

    const verifyInvariants = (
      result: { events: TestEvent[]; startBlock: number; endBlock: number },
      expectedStart: number,
      expectedEnd: number,
    ) => {
      const expectedCount = expectedEnd - expectedStart + 1;
      const blocks = result.events.map((e) => e.block);

      // Invariant 1: correct count (no gaps, no duplicates implied)
      expect(blocks).toHaveLength(expectedCount);

      // Invariant 2: no duplicates
      const uniqueBlocks = new Set(blocks);
      expect(uniqueBlocks.size).toBe(expectedCount);

      // Invariant 3: all expected blocks present
      for (let b = expectedStart; b <= expectedEnd; b++) {
        expect(uniqueBlocks.has(b)).toBe(true);
      }

      // Invariant 4: ordered (non-decreasing)
      for (let i = 1; i < blocks.length; i++) {
        expect(blocks[i]).toBeGreaterThanOrEqual(blocks[i - 1]);
      }

      // Invariant 5: boundaries correct
      expect(result.startBlock).toBe(expectedStart);
      expect(result.endBlock).toBe(expectedEnd);
    };

    describe.each(ranges)('$name', ({ start, end }) => {
      it.each(failurePatterns)(
        'pattern: $name → all invariants hold',
        async (pattern) => {
          const fetcher = createPatternFetcher(pattern);

          const result = await fetchEventsFallOver<TestEvent, FetchResult>(
            start,
            end,
            fetcher,
          );

          verifyInvariants(result, start, end);
        },
      );
    });
  });

  describe('matrix: call sequence verification', () => {
    /**
     * Split formula: center = Math.ceil((start + end) / 2)
     * For range [0, 10]:
     * - center = Math.ceil(10/2) = 5
     * - left = [0, 4], right = [5, 10]
     */
    it('should process left child before right child (DFS order)', async () => {
      const calls: Array<{ start: number; end: number }> = [];
      const fetcher = createFetcher(async (start, end) => {
        calls.push({ start, end });
        if (start === 0 && end === 10) {
          throw new AllProvidersFailedError('Split needed');
        }
        return {
          events: createEventsForRange(start, end),
          startBlock: start,
          endBlock: end,
        };
      });

      await fetchEventsFallOver<TestEvent, FetchResult>(0, 10, fetcher);

      // [0,10] → split → [0,4] and [5,10]
      expect(calls[0]).toEqual({ start: 0, end: 10 });
      expect(calls[1]).toEqual({ start: 0, end: 4 }); // left child first (DFS)
      expect(calls[2]).toEqual({ start: 5, end: 10 }); // right child second
    });

    it('should handle nested splits correctly', async () => {
      const calls: Array<{ start: number; end: number }> = [];
      const fetcher = createFetcher(async (start, end) => {
        calls.push({ start, end });
        // Fail on [0,10] and [0,4]
        if ((start === 0 && end === 10) || (start === 0 && end === 4)) {
          throw new AllProvidersFailedError('Split needed');
        }
        return {
          events: createEventsForRange(start, end),
          startBlock: start,
          endBlock: end,
        };
      });

      const result = await fetchEventsFallOver<TestEvent, FetchResult>(
        0,
        10,
        fetcher,
      );

      // [0,10] fails → [0,4] and [5,10]
      // [0,4] fails → [0,1] and [2,4]
      // [0,1] succeeds, [2,4] succeeds, [5,10] succeeds
      expect(calls).toEqual([
        { start: 0, end: 10 },
        { start: 0, end: 4 },
        { start: 0, end: 1 },
        { start: 2, end: 4 },
        { start: 5, end: 10 },
      ]);

      expect(result.events).toHaveLength(11);
    });

    it('should handle right child failure', async () => {
      const calls: Array<{ start: number; end: number }> = [];
      const fetcher = createFetcher(async (start, end) => {
        calls.push({ start, end });
        // Fail on [0,10] and [5,10]
        if ((start === 0 && end === 10) || (start === 5 && end === 10)) {
          throw new AllProvidersFailedError('Split needed');
        }
        return {
          events: createEventsForRange(start, end),
          startBlock: start,
          endBlock: end,
        };
      });

      const result = await fetchEventsFallOver<TestEvent, FetchResult>(
        0,
        10,
        fetcher,
      );

      // [0,10] fails → [0,4] and [5,10]
      // [0,4] succeeds
      // [5,10] fails → [5,7] and [8,10]
      expect(calls).toEqual([
        { start: 0, end: 10 },
        { start: 0, end: 4 },
        { start: 5, end: 10 },
        { start: 5, end: 7 },
        { start: 8, end: 10 },
      ]);

      expect(result.events).toHaveLength(11);
    });

    it('should handle both children failing until small enough', async () => {
      const calls: Array<{ start: number; end: number }> = [];
      const fetcher = createFetcher(async (start, end) => {
        calls.push({ start, end });
        // Fail until range <= 3
        if (end - start > 3) {
          throw new AllProvidersFailedError('Range too large');
        }
        return {
          events: createEventsForRange(start, end),
          startBlock: start,
          endBlock: end,
        };
      });

      const result = await fetchEventsFallOver<TestEvent, FetchResult>(
        0,
        10,
        fetcher,
      );

      // Verify all successful calls have range <= 3
      const failedCalls = calls.filter((c) => c.end - c.start > 3);
      const successfulCalls = calls.filter((c) => c.end - c.start <= 3);

      expect(failedCalls.length).toBeGreaterThan(0);
      expect(successfulCalls.length).toBeGreaterThan(0);
      expect(result.events).toHaveLength(11);
    });
  });

  describe('matrix: edge cases', () => {
    const edgeCases = [
      { start: 0, end: 0, name: 'single block at 0' },
      { start: 5, end: 5, name: 'single block at 5' },
      { start: 0, end: 1, name: 'two blocks [0,1]' },
      { start: 0, end: 2, name: 'three blocks [0,2] (min splittable)' },
      { start: 100, end: 100, name: 'single block at 100' },
    ];

    it.each(edgeCases)(
      '$name: should handle without splitting',
      async ({ start, end }) => {
        const fetcher = createSuccessFetcher();
        const result = await fetchEventsFallOver(start, end, fetcher);

        expect(result.events).toHaveLength(end - start + 1);
        expect(fetcher).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      {
        start: 0,
        end: 2,
        splits: true,
        name: '[0,2] can split to [0,0]+[1,2]',
      },
      {
        start: 0,
        end: 1,
        splits: false,
        name: '[0,1] cannot split',
      },
    ])('$name', async ({ start, end, splits }) => {
      const fetcher = createFetcher(async (s, e) => {
        if (s === start && e === end) {
          throw new AllProvidersFailedError('First call fails');
        }
        return {
          events: createEventsForRange(s, e),
          startBlock: s,
          endBlock: e,
        };
      });

      if (splits) {
        const result = await fetchEventsFallOver<TestEvent, FetchResult>(
          start,
          end,
          fetcher,
        );
        expect(result.events).toHaveLength(end - start + 1);
      } else {
        await expect(
          fetchEventsFallOver<TestEvent, FetchResult>(start, end, fetcher),
        ).rejects.toThrow(AllProvidersFailedError);
      }
    });
  });
});
