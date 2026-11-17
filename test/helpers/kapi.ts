const KAPI_URL = 'http://127.0.0.1:3000';
const READY_TIMEOUT_MS = 180_000;
const REQUEST_TIMEOUT_MS = 10_000;

async function fetchKapiJson(path: string): Promise<any> {
  const response = await fetch(`${KAPI_URL}${path}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Keys API returned HTTP ${response.status}`);
  }
  return response.json();
}

async function waitForKapi(
  description: string,
  ready: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      if (await ready()) {
        console.log(`Keys API is ready: ${description}`);
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new Error(
    `Keys API did not become ready within ${READY_TIMEOUT_MS} ms: ${description}${detail}`,
  );
}

export async function waitForNewerBlock(block: number): Promise<void> {
  await waitForKapi(`block newer than ${block}`, async () => {
    const status = await fetchKapiJson('/v1/status');
    return status.elBlockSnapshot.blockNumber > block;
  });
}

export async function waitForNewerOrEqBlock(block: number): Promise<void> {
  await waitForKapi(`block at least ${block}`, async () => {
    const status = await fetchKapiJson('/v1/status');
    return status.elBlockSnapshot.blockNumber >= block;
  });
}

export async function waitKAPIUpdateModulesKeys(): Promise<void> {
  await waitForKapi('modules endpoint', async () => {
    const response = await fetch(`${KAPI_URL}/v1/modules`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    await response.body?.cancel();
    if (!response.ok) {
      throw new Error(`Keys API returned HTTP ${response.status}`);
    }
    return response.status === 200;
  });
}
