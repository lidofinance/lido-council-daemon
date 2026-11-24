import * as appRoot from 'app-root-path';
import { readFileSync } from 'fs';
import { join } from 'path';
import { formatBytes32String } from 'ethers/lib/utils';

export interface BuildInfo {
  version: string;
  branch: string;
  commit: string;
}

/**
 * The image writes `build-info.json` at build time. The repository keeps a
 * `dev` copy for local runs.
 */
export const readBuildInfo = (
  path = join(appRoot.path, 'build-info.json'),
): BuildInfo => {
  let info: Partial<BuildInfo>;
  try {
    info = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    throw new Error(`Cannot read build info from ${path}: ${error}`);
  }

  for (const field of ['version', 'branch', 'commit'] as const) {
    if (typeof info[field] !== 'string' || info[field] === '') {
      throw new Error(`Build info in ${path} has no ${field}`);
    }
  }

  return info as BuildInfo;
};

/**
 * Guardian messages carry the version as `bytes32`, which holds at most 31
 * bytes of text.
 */
export const assertVersionFitsBytes32 = (version: string): void => {
  try {
    formatBytes32String(version);
  } catch {
    throw new Error(
      `App version "${version}" is longer than 31 bytes and does not fit into guardian messages`,
    );
  }
};

const buildInfo = readBuildInfo();

export const APP_NAME = 'lido-council-daemon';
export const APP_VERSION = buildInfo.version;
export const APP_BRANCH = buildInfo.branch;
export const APP_COMMIT = buildInfo.commit;
export const APP_DESCRIPTION = process.env.npm_package_description;

export const USER_AGENT = `${APP_NAME}/${APP_VERSION}`;
