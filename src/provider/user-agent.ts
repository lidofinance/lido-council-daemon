import type { ConnectionInfo } from 'ethers/lib/utils';
import { USER_AGENT } from 'app.constants';
import { NonEmptyArray } from 'common/config';

/** Adds the daemon `User-Agent` header to every RPC URL. */
export const withUserAgent = (
  urls: NonEmptyArray<string>,
): NonEmptyArray<ConnectionInfo> => {
  const [first, ...rest] = urls.map((url) => ({
    url,
    headers: { 'User-Agent': USER_AGENT },
  }));
  return [first, ...rest];
};
