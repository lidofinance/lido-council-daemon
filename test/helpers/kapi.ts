import axios from 'axios';

export async function waitForNewerBlock(block: number) {
  let isServiceReady = false;
  while (!isServiceReady) {
    try {
      const response = await axios.get('http://127.0.0.1:3000/v1/status');
      if (response.data['elBlockSnapshot']['blockNumber'] > block) {
        console.log(
          `KAPI is ready! Got Block newer than ${block}, got ${response.data['elBlockSnapshot']['blockNumber']} `,
        );
        isServiceReady = true;
      }
    } catch (err) {
      // console.log('Service not ready yet, waiting...');
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }
}

// TODO: get rid of one of modules waitForNewerOrEqBlock or waitForNewerBlock
export async function waitForNewerOrEqBlock(block: number) {
  let isServiceReady = false;
  while (!isServiceReady) {
    try {
      // TODO: write url in the constant
      const response = await axios.get('http://127.0.0.1:3000/v1/status');
      if (response.data['elBlockSnapshot']['blockNumber'] >= block) {
        console.log(
          `KAPI is ready! Got Block newer than ${block}, got ${response.data['elBlockSnapshot']['blockNumber']} `,
        );
        isServiceReady = true;
      }
    } catch (err) {
      // console.log('Service not ready yet, waiting...');
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }
}

export async function waitKAPIUpdateModulesKeys(): Promise<void> {
  let isServiceReady = false;
  while (!isServiceReady) {
    try {
      const response = await axios.get('http://127.0.0.1:3000/v1/modules');
      if (response.status === 200) {
        console.log('Kapi is ready');
        isServiceReady = true;
      }
    } catch (err: any) {
      console.log('Service not ready yet, waiting...', err.message);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }
}
