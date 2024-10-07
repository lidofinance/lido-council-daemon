import axios from 'axios';
import * as dockerCompose from 'docker-compose';

export async function waitForServiceToBeReady(): Promise<void> {
  let isServiceReady = false;
  while (!isServiceReady) {
    try {
      const response = await axios.get('http://localhost:3000/api/status');
      if (response.status === 200) {
        isServiceReady = true;
      }
    } catch (err) {
      console.log('Service not ready yet, waiting...');
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
    }
  }
}

export async function printServiceLogs(): Promise<void> {
  try {
    const { out, err } = await dockerCompose.logs('e2e_keys_api', {
      cwd: '.',
      config: 'docker-compose.kapi.yml',
    });

    console.log('e2e_keys_api Logs:');
    console.log(out);
    console.error(err); // Print any errors
  } catch (error) {
    console.error('Error printing logs:', error);
  }
}
