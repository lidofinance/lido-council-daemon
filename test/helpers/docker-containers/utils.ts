import * as Docker from 'dockerode';
import * as dotenv from 'dotenv';
import { CHAIN_ID } from '../config';

dotenv.config();

const POSTGRES_PORT = process.env.POSTGRES_PORT || '5432';
// Keys API dev image published on 2026-10-15 (linux/amd64).
const KAPI_IMAGE =
  'lidofinance/lido-keys-api@sha256:51213022c196cd05bdd176cff5cb8ec227928f88c1b5f0c14c8c9ff0a6f946a6';
// PostgreSQL 14.24 on Alpine.
const PSQL_IMAGE =
  'postgres@sha256:4ea9e5ed06591da7ea23eb65465e8d3187fe79f4d5ec3ae976d29a33b013e77a';
const PSQL_CONTAINER = 'council-e2e-pgdb';
const PSQL_VOLUME = `council-e2e-pgdata-${CHAIN_ID}`;
const KAPI_CONTAINER = 'council-e2e-keys-api';
const NETWORK_NAME = 'council-e2e-network';

/**
 * Pull image if didn't find locally
 */
async function pullImage(docker: Docker, imageName: string, platform?: string) {
  // Initialize docker instance and check if image already exists
  const image = docker.getImage(imageName);

  try {
    await image.inspect();
    console.log(`Image ${imageName} exists.`);
  } catch (error: any) {
    if (error.statusCode === 404) {
      console.log(`Image ${imageName} does not exist.`);
      await createImage(docker, imageName, platform);
    } else {
      throw error; // Re-throw other errors for debugging
    }
  }
}

async function createImage(
  docker: Docker,
  imageRef: string,
  platform?: string,
) {
  try {
    const opts = platform ? { platform } : {};
    const stream = await docker.pull(imageRef, opts);

    return await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err, res) => {
        if (err) {
          console.error(`Failed to pull image ${imageRef}`, err);
          reject(err);
        } else {
          console.log(`Successfully pulled image: ${imageRef}`);
          resolve(res);
        }
      });
    });
  } catch (error) {
    console.error(`Error pulling image ${imageRef}:`, error); // Log any initial pull error
    throw error;
  }
}

/**
 * Check if container exist
 */
export async function getContainer(
  docker: Docker,
  name: string,
  expectedImage: string,
) {
  const container = await docker.getContainer(name);

  try {
    const info = await container.inspect();
    if (info.Config.Image !== expectedImage) {
      throw new Error(
        `Container ${name} uses another image; remove it before rerunning E2E tests`,
      );
    }
    console.log(`Container ${name} already exists`);
    return container;
  } catch (error: any) {
    if (error.statusCode == 404) {
      console.log(`Container ${name} does not exist`);
      return undefined;
    }

    throw error;
  }
}

/**
 * Pull and create psql container
 */
async function pullAndCreatePsqlContainer(docker: Docker) {
  const platform = process.env.DOCKER_PLATFORM;
  await pullImage(docker, PSQL_IMAGE, platform);

  const alreadyCreatedContainer = await getContainer(
    docker,
    PSQL_CONTAINER,
    PSQL_IMAGE,
  );

  if (alreadyCreatedContainer) {
    const info = await alreadyCreatedContainer.inspect();
    const dataMount = info.Mounts.find(
      (mount) => mount.Destination === '/var/lib/postgresql/data',
    );
    if (dataMount?.Type !== 'volume' || dataMount.Name !== PSQL_VOLUME) {
      throw new Error(
        `Container ${PSQL_CONTAINER} must use volume ${PSQL_VOLUME}; remove it before rerunning E2E tests`,
      );
    }
    return alreadyCreatedContainer;
  }

  // Create and configure the PostgreSQL container
  const container = await docker.createContainer({
    Image: PSQL_IMAGE,
    name: PSQL_CONTAINER,
    Env: [
      'POSTGRES_DB=node_operator_keys_service_db',
      'POSTGRES_USER=postgres',
      'POSTGRES_PASSWORD=postgres',
    ],
    ExposedPorts: { '5432/tcp': {} },
    HostConfig: {
      Mounts: [
        {
          Type: 'volume',
          Source: PSQL_VOLUME,
          Target: '/var/lib/postgresql/data',
        },
      ],
      PortBindings: {
        '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: POSTGRES_PORT }],
      },
      NetworkMode: NETWORK_NAME,
    },
    Healthcheck: {
      Test: [
        'CMD-SHELL',
        'PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "SELECT 1" >/dev/null',
      ],
      Interval: 5_000_000_000,
      Timeout: 3_000_000_000,
      Retries: 12,
    },
  });

  console.log(`Container ${PSQL_CONTAINER} created`);

  return container;
}

/**
 * Pull and create keys api container
 */
async function pullAndCreateKapiContainer(docker: Docker) {
  const platform = process.env.DOCKER_PLATFORM || 'linux/amd64';

  await pullImage(docker, KAPI_IMAGE, platform);

  const alreadyCreatedContainer = await getContainer(
    docker,
    KAPI_CONTAINER,
    KAPI_IMAGE,
  );

  if (alreadyCreatedContainer) {
    return alreadyCreatedContainer;
  }

  const HARDHAT_URL = 'http://host.docker.internal:8545';

  const container = await docker.createContainer({
    Image: KAPI_IMAGE,
    platform,
    name: KAPI_CONTAINER,
    Env: [
      'NODE_ENV=production',
      'PORT=3000',
      'DB_NAME=node_operator_keys_service_db',
      'DB_PORT=5432',
      `DB_HOST=${PSQL_CONTAINER}`,
      'DB_USER=postgres',
      'DB_PASSWORD=postgres',
      `PROVIDERS_URLS=${HARDHAT_URL}`,
      'VALIDATOR_REGISTRY_ENABLE=false',
      `CHAIN_ID=${CHAIN_ID}`,
      'CL_API_URLS=',
    ],
    Healthcheck: {
      Test: ['CMD', 'wget', '-q', '--spider', 'http://127.0.0.1:3000/health'],
      Interval: 5_000_000_000,
      Timeout: 3_000_000_000,
      Retries: 12,
    },
    ExposedPorts: { '3000/tcp': {} },
    HostConfig: {
      PortBindings: {
        '3000/tcp': [{ HostIp: '127.0.0.1', HostPort: '3000' }],
      },
      NetworkMode: NETWORK_NAME,
      ...(process.platform === 'linux'
        ? { ExtraHosts: ['host.docker.internal:host-gateway'] }
        : {}),
    },
  });

  console.log(`Container ${KAPI_CONTAINER} created`);

  return container;
}

async function networkExists(docker: Docker, name) {
  const network = await docker.getNetwork(name);

  try {
    await network.inspect();
    console.log(`Network ${name} already exists`);
    return true;
  } catch (error: any) {
    if (error.statusCode === 404) {
      // Create network for containers
      console.log(`Network ${name} doesn't exists`);
      return false;
    }
  }
}

async function createNetwork(docker: Docker, name) {
  const exists = await networkExists(docker, name);

  if (exists) {
    return;
  }

  await docker.createNetwork({ Name: name });
  console.log(`Network ${name} successfully created`);
}

/**
 * Setup containers
 */
export async function setupContainers() {
  const docker = new Docker();
  await createNetwork(docker, NETWORK_NAME);

  // Create PostgreSQL and KAPI containers on the same network
  const psqlContainer = await pullAndCreatePsqlContainer(docker);
  const kapiContainer = await pullAndCreateKapiContainer(docker);

  return {
    kapi: kapiContainer,
    psql: psqlContainer,
  };
}

export async function startContainerIfNotRunning(container: Docker.Container) {
  const containerInfo = await container.inspect();
  const status = containerInfo.State.Status;

  if (status === 'running') {
    console.log(`Container ${container.id} is running`);
    await waitForContainerRunning(container);
    return;
  }

  console.log(`Starting container ${container.id}...`);
  await container.start();
  await waitForContainerRunning(container);
}

async function waitForContainerRunning(
  container: Docker.Container,
  retries = 72,
  interval = 2500,
) {
  for (let i = 0; i < retries; i++) {
    const containerInfo = await container.inspect();
    const status = containerInfo.State.Status;

    const health = containerInfo.State.Health?.Status;
    if (status === 'running' && (!health || health === 'healthy')) {
      console.log(`Container ${container.id} is running`);
      return;
    }
    if (status === 'exited' || status === 'dead' || health === 'unhealthy') {
      throw new Error(
        `Container ${container.id} failed to start: status=${status}, health=${health}`,
      );
    }

    console.log(
      `Waiting for container ${container.id} to be running. Current status: ${status}`,
    );
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(
    `Container did not start running after ${
      (retries * interval) / 1000
    } seconds`,
  );
}

export async function getContainerLogs(container: Docker.Container) {
  try {
    const stream = await container.logs({
      stdout: true,
      stderr: true,
      tail: 50,
    });
    console.log(`Container ${container.id} logs:`, stream.toString());
  } catch (error) {
    console.error(`Failed to get container logs:`, error);
  }
}
