import { NonEmptyArray } from './configuration';

/**
 * Config values that are secrets. An RPC URL carries the provider key, and a
 * Keys API URL counts as a secret too. Each value can also come from a file
 * named by `<NAME>_FILE`; the file wins over the env value.
 */
export const SECRET_ENVS = [
  'WALLET_PRIVATE_KEY',
  'WALLET_PRIVATE_KEY_2',
  'RPC_URL',
  'PROVIDERS_URLS',
  'EVM_CHAIN_DATA_BUS_PROVIDER_URL',
  'EVM_CHAIN_DATA_BUS_PROVIDERS_URLS',
  'KEYS_API_URL',
  'KEYS_API_HOST',
] as const;

/** Secrets that hold a list of URLs. */
export const URL_LIST_ENVS: readonly string[] = [
  'PROVIDERS_URLS',
  'EVM_CHAIN_DATA_BUS_PROVIDERS_URLS',
];

/**
 * Parses a URL list. URLs are separated by commas or white space, including
 * new lines. A trailing `/` is dropped. An empty list gives `undefined`, as if
 * the value is not set.
 */
export const parseUrlList = (
  value: unknown,
): NonEmptyArray<string> | undefined => {
  if (value === undefined || value === null) return undefined;

  const text = Array.isArray(value) ? value.join(',') : String(value);
  const urls = text
    .split(/[\s,]+/)
    .map((url) => url.replace(/\/$/, ''))
    .filter((url) => url !== '');

  return urls.length > 0 ? (urls as NonEmptyArray<string>) : undefined;
};

/**
 * The secret values of a config for log masking. A wallet key is also
 * masked in lower case, with and without the `0x` prefix.
 */
export const secretValues = (config: object): string[] => {
  const source = config as Record<string, unknown>;
  const values = SECRET_ENVS.flatMap((name) => source[name] ?? []).filter(
    (value): value is string => typeof value === 'string' && value !== '',
  );

  for (const name of ['WALLET_PRIVATE_KEY', 'WALLET_PRIVATE_KEY_2']) {
    const key = source[name];
    if (typeof key !== 'string' || key === '') continue;

    const lower = key.toLowerCase();
    const bare = lower.startsWith('0x') ? lower.slice(2) : lower;
    values.push(bare, `0x${bare}`);
  }

  return [...new Set(values)];
};

const KEY_MIN_LENGTH = 16;
const KEY_PREFIX_LENGTH = 8;
const URL_SCHEMES = ['http:', 'https:', 'ws:', 'wss:'];

const isKeyLike = (value: string) =>
  value.length >= KEY_MIN_LENGTH && /[0-9A-Z]/.test(value);

const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * The key-like parts of a URL secret. A URL without one is masked whole, so
 * its host and path count as the key. Another secret is a key as a whole.
 */
const secretKeys = (secret: string): string[] => {
  let url: URL;
  try {
    url = new URL(secret);
  } catch {
    return [secret];
  }
  if (!URL_SCHEMES.includes(url.protocol)) return [secret];

  const keys = [
    ...url.pathname.split('/'),
    ...url.searchParams.values(),
    url.username,
    url.password,
  ]
    .map(decode)
    .filter(isKeyLike);

  return keys.length > 0 ? keys : [`${url.host}${url.pathname}`];
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Patterns for the start of each key. A library can cut a long error text
 * before the logger masks it, and the cut can split a key. These patterns
 * mask the piece that is left when it has at least 8 characters.
 */
export const secretPrefixPatterns = (config: object): RegExp[] => {
  const prefixes = secretValues(config)
    .flatMap(secretKeys)
    .map((key) => key.slice(0, KEY_PREFIX_LENGTH))
    .filter((prefix) => prefix.length === KEY_PREFIX_LENGTH);

  return [...new Set(prefixes)].map(
    (prefix) => new RegExp(`${escapeRegExp(prefix)}[^\\s"'\`,;)\\]}]*`),
  );
};

/** The `cleanSecrets` options for a config. */
export const logMaskOptions = (config: object) => ({
  secrets: secretValues(config),
  regex: secretPrefixPatterns(config),
});
