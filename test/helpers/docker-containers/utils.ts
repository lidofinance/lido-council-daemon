import * as path from 'path';
import * as Docker from 'dockerode';
import * as dotenv from 'dotenv';

dotenv.config();

const KAPI_IMAGE = 'lidofinance/lido-keys-api:staging';
const PSQL_IMAGE = 'postgres:14-alpine';

/**
 * Pull image if didnt find locally
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
    const stream = await docker.pull(imageRef, {
      platform: options.platform,
    });

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
async function pullAndCreatePsqlContainer(docker: Docker, networkName: string) {
  const platform = process.env.DOCKER_PLATFORM;
  const pgdataPath = path.resolve(`./.volumes/pgdata-17000/`);

  await pullImage(docker, PSQL_IMAGE, platform);

  const alreadyCreatedContainer = await getContainer(docker, 'e2e_pgdb');

  if (alreadyCreatedContainer) {
    return alreadyCreatedContainer;
  }

  // Create and configure the PostgreSQL container
  const container = await docker.createContainer({
    Image: PSQL_IMAGE,
    name: 'e2e_pgdb',
    Env: [
      'POSTGRES_DB=node_operator_keys_service_db',
      'POSTGRES_USER=postgres',
      'POSTGRES_PASSWORD=postgres',
    ],
    ExposedPorts: { '5432/tcp': {} },
    HostConfig: {
      Binds: [`${pgdataPath}:/var/lib/postgresql/data:rw`],
      // TODO: use config
      PortBindings: { '5432/tcp': [{ HostPort: '5432' }] },
      NetworkMode: networkName,
    },
  });

  console.log('Container e2e_pgdb created');

  return container;
}

/**
 * Pull and create keys api container
 */
async function pullAndCreateKapiContainer(docker: Docker, networkName: string) {
  const platform = process.env.DOCKER_PLATFORM;

  await pullImage(docker, KAPI_IMAGE, platform);

  const alreadyCreatedContainer = await getContainer(docker, 'e2e_keys_api');

  if (alreadyCreatedContainer) {
    return alreadyCreatedContainer;
  }

  // Create and configure the PostgreSQL container
  const container = await docker.createContainer({
    Image: KAPI_IMAGE,
    name: 'e2e_keys_api',
    Env: [
      'NODE_ENV=production',
      'DB_NAME=node_operator_keys_service_db',
      'DB_PORT=5432',
      'DB_HOST=e2e_pgdb',
      'DB_USER=postgres',
      'DB_PASSWORD=postgres',
      'PROVIDERS_URLS=http://host.docker.internal:8545',
      'VALIDATOR_REGISTRY_ENABLE=false',
      `CHAIN_ID=17000`,
      'CL_API_URLS=',
    ],
    ExposedPorts: { '3000/tcp': {} },
    HostConfig: {
      PortBindings: { '3000/tcp': [{ HostPort: '3000' }] },
      NetworkMode: networkName,
    },
    ExtraHosts: ['host.docker.internal:host-gateway'],
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

  await createNetwork(docker, 'e2e_network');

  // Create PostgreSQL and KAPI containers on the same network
  const psqlContainer = await pullAndCreatePsqlContainer(docker, 'e2e_network');
  const kapiContainer = await pullAndCreateKapiContainer(docker, 'e2e_network');

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
