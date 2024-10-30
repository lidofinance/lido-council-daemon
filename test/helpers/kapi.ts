import axios from 'axios';

export async function waitForNewerBlock(block: number) {
  let isServiceReady = false;
  while (!isServiceReady) {
    try {
      const response = await axios.get('http://localhost:3000/v1/status');
      if (response.data['elBlockSnapshot']['blockNumber'] > block) {
        console.log(
          `Service is ready! Got Block newer than ${block}, got ${response.data['elBlockSnapshot']['blockNumber']} `,
        );
        isServiceReady = true;
      }
    } catch (err) {
      console.log('Service not ready yet, waiting...');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

// TODO: get rid of one of modules waitForNewerOrEqBlock or waitForNewerBlock
export async function waitForNewerOrEqBlock(block: number) {
  let isServiceReady = false;
  while (!isServiceReady) {
    try {
      // TODO: write url in the constant
      const response = await axios.get('http://localhost:3000/v1/status');
      if (response.data['elBlockSnapshot']['blockNumber'] >= block) {
        console.log(
          `Service is ready! Got Block newer than ${block}, got ${response.data['elBlockSnapshot']['blockNumber']} `,
        );
        isServiceReady = true;
      }
    } catch (err) {
      console.log('Service not ready yet, waiting...');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

export async function waitForServiceToBeReady(): Promise<void> {
  let isServiceReady = false;
  while (!isServiceReady) {
    try {
      const response = await axios.get('http://localhost:3000/v1/modules');
      if (response.status === 200) {
        isServiceReady = true;
      }
    } catch (err) {
      console.log('Service not ready yet, waiting...');
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 1 second
    }
  }
}
