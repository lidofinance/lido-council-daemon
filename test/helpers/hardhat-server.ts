import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import net from 'net';

export class HardhatServer {
  private hardhatProcess: ChildProcessWithoutNullStreams | null = null;
  private ready = false;

  // Method to start Hardhat and wait until it's ready
  public async start() {
    await this.checkPort(8545);
    return new Promise<void>((resolve, reject) => {
      this.hardhatProcess = spawn('npx', [
        'hardhat',
        'node',
        '--hostname',
        '0.0.0.0',
      ]);

      if (!this.hardhatProcess) {
        return reject(new Error('Failed to start Hardhat process'));
      }

      // Log the PID of the started process
      console.log(
        `Hardhat process started with PID: ${this.hardhatProcess.pid}`,
      );

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

  public async stop() {
    if (this.hardhatProcess) {
      try {
        // Attempt to kill the process
        this.hardhatProcess.kill('SIGTERM');

        await new Promise((resolve) => setTimeout(resolve, 100));

        const stillRunning = this.hardhatProcess && !this.hardhatProcess.killed;

        if (stillRunning) {
          console.warn('Hardhat process did not terminate as expected.');
        } else {
          console.log('Hardhat process killed successfully.');

          await this.checkPort(8545);
        }
      } catch (error) {
        console.error(
          'Error occurred while stopping the Hardhat process:',
          error,
        );
      }
    } else {
      console.log('No Hardhat process to stop.');
    }
  }

  async checkPort(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();

      client.connect({ port }, () => {
        console.log(`Port ${port} is open and accessible.`);
        client.end();
        resolve();
      });

      client.on('error', (err) => {
        console.error(`Failed to connect to port ${port}:`, err);
        reject(
          new Error(
            `Port ${port} is not accessible. Hardhat process may not have started correctly.`,
          ),
        );
      });

      client.on('timeout', () => {
        console.warn(
          `Timeout while checking port ${port}. Assuming it's closed.`,
        );
        client.end();
        resolve();
      });
    });
  }
}
