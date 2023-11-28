import { Injectable } from '@nestjs/common';
import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { ValidationResult } from './interfaces/validation-result';

@Injectable()
export class MultithreadedUnusedKeysValidationService {
  private store: Map<string, ValidationResult>;

  constructor() {
    this.store = new Map<string, ValidationResult>();
  }

  async validateAndCacheList(
    lidoWC: string,
    keys: RegistryKey[],
  ): Promise<RegistryKey[]> {
    const numCores = cpus().length;
    const chunkSize = Math.ceil(keys.length / numCores);
    const promises: Promise<{ key: RegistryKey; isValid: boolean }[]>[] = [];

    console.log('numberCores', numCores);

    for (let i = 0; i < numCores; i++) {
      const chunk = keys.slice(i * chunkSize, (i + 1) * chunkSize);
      if (chunk.length) {
        promises.push(this.processChunk(lidoWC, chunk));
      }
    }

    const results = (await Promise.all(promises)).flat();
    return results
      .filter((result) => !result.isValid)
      .map((result) => result.key);
  }

  getKey(key: string) {
    return this.store.get(key);
  }

  storeKey(key: string, validationResult: ValidationResult) {
    return this.store.set(key, validationResult);
  }

  clearCache(): void {
    this.store.clear();
  }

  private async processChunk(
    lidoWC: string,
    chunk: RegistryKey[],
  ): Promise<{ key: RegistryKey; isValid: boolean }[]> {
    return new Promise((resolve, reject) => {
      console.log('worker?', __dirname);
      const worker = new Worker(__dirname + '/bls-verify.worker.js', {
        workerData: { lidoWC, chunk },
      });

      console.log('mm worker?');
      worker.on('message', resolve);
      worker.on('error', (reject) => {
        console.log('reject', reject);

        return reject;
      });
      worker.on('exit', (code) => {
        if (code !== 0)
          reject(new Error(`Worker stopped with exit code ${code}`));
      });
    });
  }
}
