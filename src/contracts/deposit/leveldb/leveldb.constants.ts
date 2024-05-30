export const DB_DIR = 'cache';
export const DB_LAYER_DIR = 'cache:layer';

export const DB_DEFAULT_VALUE = 'cacheDefaultValue';

export const DEPOSIT_CACHE_DEFAULT = Object.freeze({
  headers: {
    version: '-1',
    startBlock: 0,
    endBlock: 0,
  },
  data: [],
});

export const MAX_DEPOSIT_COUNT = 2 ** 32;
