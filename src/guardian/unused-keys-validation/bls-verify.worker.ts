import { NestFactory } from '@nestjs/core';
import { workerData, parentPort } from 'worker_threads';
import { BlsService } from '../../bls/bls.service';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { MultithreadedUnusedKeysValidationService } from './multithread-keys-validation.service';
import { VerificationWorkerAppModule } from 'verification-worker-app.module';
import { ValidationResult } from './interfaces/validation-result';

interface WorkerData {
  lidoWC: string;
  chunk: RegistryKey[];
  cache: Map<string, ValidationResult>;
}

async function verifyAndCache() {
  const app = await NestFactory.createApplicationContext(
    VerificationWorkerAppModule,
    {
      bufferLogs: true,
    },
  );
  const blsService = app.get(BlsService);
  const data: WorkerData = workerData as WorkerData;

  const cache = data.cache;

  const results: { key: RegistryKey; isValid: boolean }[] = data.chunk.map(
    (key) => {
      const cachedKey = multithredKeysValidation.getKey(key.key);

      if (cachedKey) {
        // Update the element only if the signature has changed
        if (isDataDifferent(data, cachedKey)) {
          const depositData = getDepositData(
            data.lidoWC,
            key.key,
            key.depositSignature,
          );
          const isValid = blsService.verify(depositData);
          return { key, isValid };
        }

        const isValid = cachedKey.isValid;

        return { key, isValid };
      } else {
        const depositData = getDepositData(
          data.lidoWC,
          key.key,
          key.depositSignature,
        );
        const isValid = blsService.verify(depositData);
        return { key, isValid };
      }
    },
  );

  // Check if parentPort is not null before using it
  if (parentPort) {
    parentPort.postMessage(results);
  } else {
    throw new Error(
      'parentPort is null - script is not running as a worker thread',
    );
  }
}

function isDataDifferent(data, key) {
  return (
    data.depositSignature !== key.depositSignature ||
    data.operatorIndex != key.operatorIndex ||
    data.index != key.index ||
    data.moduleAddress != key.moduleAddress
  );
}

function getDepositData(lidoWC: string, pubkey: string, signature: string) {
  const depositData = {
    pubkey,
    wc: lidoWC,
    amount: '0x0040597307000000',
    signature,
  };

  return depositData;
}

verifyAndCache();
