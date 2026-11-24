let ready = false;

/** Marks the daemon ready. The state never goes back to not ready. */
export const markReady = (): void => {
  ready = true;
};

export const isReady = (): boolean => ready;
