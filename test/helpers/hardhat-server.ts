import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

export class HardhatServer {
  private hardhatProcess: ChildProcessWithoutNullStreams | null = null;
  private ready = false;

  // Method to start Hardhat and wait until it's ready
  public async start() {
    return new Promise<void>((resolve, reject) => {
      this.hardhatProcess = spawn('npx', ['hardhat', 'node']);

      if (!this.hardhatProcess) {
        return reject(new Error('Failed to start Hardhat process'));
      }

      // Listen for stdout to detect when Hardhat is ready
      this.hardhatProcess.stdout.on('data', (data) => {
        const output = data.toString();
        // console.log(`Hardhat stdout: ${output}`);

        // Check for the Hardhat ready message
        if (output.includes('Started HTTP and WebSocket JSON-RPC server')) {
          this.ready = true;
          resolve();
        }
      });

      // Listen for errors
      this.hardhatProcess.stderr.on('data', (data) => {
        console.error(`Hardhat stderr: ${data}`);
      });

      this.hardhatProcess.on('error', (error) => {
        console.error(`Failed to start Hardhat: ${error}`);
        reject(error);
      });

      this.hardhatProcess.on('close', (code) => {
        if (code !== 0 && !this.ready) {
          reject(
            new Error(`Hardhat process exited unexpectedly with code ${code}`),
          );
        }
      });
    });
  }

  // Method to stop the Hardhat process
  public stop() {
    if (this.hardhatProcess) {
      this.hardhatProcess.kill();
      console.log('Hardhat process killed');
    }
  }
}
