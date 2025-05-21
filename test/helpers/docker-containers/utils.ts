import * as path from 'path';
import * as Docker from 'dockerode';
import * as dotenv from 'dotenv';

dotenv.config();

const POSTGRES_PORT = process.env.POSTGRES_PORT || '5432';
const KAPI_IMAGE = 'lidofinance/lido-keys-api:staging';
const PSQL_IMAGE = 'postgres:14-alpine';
const PSQL_CONTAINER = 'e2e_pgdb';
const KAPI_CONTAINER = 'e2e_keys_api';
const NETWORK_NAME = 'e2e_network';

/**
 * Pull image if didn't find locally
 */
async function pullImage(docker: Docker, imageName: string, platform?: string) {
  // Parse name to find image name and tag
  const [fromImage, tag = 'latest'] = imageName.split(':');
  const options: any = { fromImage, tag };

  // Add platform if specified
  if (platform) {
    options.platform = platform;
  }

  // Initialize docker instance and check if image already exists
  const image = docker.getImage(imageName);

  try {
    await image.inspect();
    console.log(`Image ${imageName} exists.`);
  } catch (error: any) {
    if (error.statusCode === 404) {
      console.log(`Image ${imageName} does not exist.`);
      await createImage(docker, options);
    } else {
      throw error; // Re-throw other errors for debugging
    }
  }
}

async function createImage(
  docker: Docker,
  options: { platform?: string; tag: string; fromImage: string },
) {
  const imageRef = `${options.fromImage}:${options.tag}`;
  try {
    const opts = options.platform ? { platform: options.platform } : {};
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
export async function getContainer(docker: Docker, name: string) {
  const container = await docker.getContainer(name);

  try {
    await container.inspect();
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
  const CHAIN_ID = process.env.CHAIN_ID;
  const pgdataPath = path.resolve(`./.volumes/pgdata-${CHAIN_ID}/`);

  await pullImage(docker, PSQL_IMAGE, platform);

  const alreadyCreatedContainer = await getContainer(docker, PSQL_CONTAINER);

  if (alreadyCreatedContainer) {
    return alreadyCreatedContainer;
  }

  const hostConfig =
    process.platform === 'linux'
      ? {
          Binds: [`${pgdataPath}:/var/lib/postgresql/data:rw`],
          NetworkMode: 'host',
        }
      : {
          Binds: [`${pgdataPath}:/var/lib/postgresql/data:rw`],
          PortBindings: {
            '5432/tcp': [{ HostPort: POSTGRES_PORT }],
          },
          NetworkMode: NETWORK_NAME,
        };

  // Create and configure the PostgreSQL container
  const container = await docker.createContainer({
    Image: PSQL_IMAGE,
    name: PSQL_CONTAINER,
    Env: [
      'POSTGRES_DB=node_operator_keys_service_db',
      'POSTGRES_USER=postgres',
      'POSTGRES_PASSWORD=postgres',
    ],
    HostConfig: hostConfig,
  });

  console.log('Container e2e_pgdb created');

  return container;
}

/**
 * Pull and create keys api container
 */
async function pullAndCreateKapiContainer(docker: Docker) {
  const platform = process.env.DOCKER_PLATFORM;

  await pullImage(docker, KAPI_IMAGE, platform);

  const alreadyCreatedContainer = await getContainer(docker, KAPI_CONTAINER);

  if (alreadyCreatedContainer) {
    return alreadyCreatedContainer;
  }

  const CHAIN_ID = process.env.CHAIN_ID;

  const hostConfig =
    process.platform === 'linux'
      ? {
          NetworkMode: 'host',
        }
      : {
          PortBindings: { '3000/tcp': [{ HostPort: '3000' }] },
          NetworkMode: NETWORK_NAME,
        };

  const HARDHAT_URL =
    process.platform === 'linux'
      ? 'http://127.0.0.1:8545'
      : 'http://host.docker.internal:8545';

  const DB_HOST = process.platform === 'linux' ? '127.0.0.1' : PSQL_CONTAINER;

  const exposedHosts =
    process.platform === 'linux' ? {} : { ExposedPorts: { '3000/tcp': {} } };

  // Create and configure the PostgreSQL container
  const container = await docker.createContainer({
    Image: KAPI_IMAGE,
    name: KAPI_CONTAINER,
    Env: [
      'NODE_ENV=production',
      'DB_NAME=node_operator_keys_service_db',
      'DB_PORT=5432',
      `DB_HOST=${DB_HOST}`,
      'DB_USER=postgres',
      'DB_PASSWORD=postgres',
      `PROVIDERS_URLS=${HARDHAT_URL}`,
      'VALIDATOR_REGISTRY_ENABLE=false',
      `CHAIN_ID=${CHAIN_ID}`,
      'CL_API_URLS=',
    ],
    ...exposedHosts,
    HostConfig: hostConfig,
  });

  console.log('Container e2e_keys_api created');

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
  if (process.platform !== 'linux') {
    await createNetwork(docker, NETWORK_NAME);
  }

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
    return;
  }

  console.log(`Starting container ${container.id}...`);
  await container.start();
  await waitForContainerRunning(container);
}

async function waitForContainerRunning(
  container: Docker.Container,
  retries = 5,
  interval = 5000,
) {
  for (let i = 0; i < retries; i++) {
    const containerInfo = await container.inspect();
    const status = containerInfo.State.Status;

    if (status === 'running') {
      console.log(`Container ${container.id} is running`);
      return;
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
