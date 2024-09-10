import 'reflect-metadata';
const oneAtTimeCallIdKey = Symbol('OneAtTimeCallId');

/**
 * A decorator that marks a specific parameter in a method for identifying the OneAtTime call ID.
 * This ID allows the same method to be executed concurrently with different parameters.
 */
export function OneAtTimeCallId(
  target: any,
  propertyKey: string | symbol,
  parameterIndex: number,
) {
  const existingMetadata: number[] =
    Reflect.getOwnMetadata(oneAtTimeCallIdKey, target, propertyKey) || [];

  if (existingMetadata.length === 0) {
    Reflect.defineMetadata(
      oneAtTimeCallIdKey,
      [parameterIndex],
      target,
      propertyKey,
    );
  } else {
    throw new Error(
      `OneAtTimeCallId decorator can only be applied to one parameter in method ${String(
        propertyKey,
      )}. It is already applied to parameter index ${existingMetadata[0]}`,
    );
  }
}

/**
 * A decorator factory that ensures a function executes one at a time.
 * Calls to the decorated method are restricted so that only one instance can be executed concurrently,
 * either globally or per OneAtTime call ID.
 * A stuck function with the OneAtTime decorator will prevent the next executions of this function.
 * That is why a timeout is set. If the execution of the promise is stuck, a timeout will occur. The default timeout is 10 minutes.
 */
export function OneAtTime<T extends (...args: any[]) => Promise<any>>(
  timeout = 600000,
) {
  return function (
    target: any,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<T>,
  ) {
    const method = descriptor.value;
    let isExecuting = false;
    const isExecutingMap = new Map<number, boolean>();

    descriptor.value = async function (this: any, ...args) {
      const oneAtTimeCallIdArgs =
        Reflect.getMetadata(oneAtTimeCallIdKey, target, propertyName) || [];

      const callId =
        oneAtTimeCallIdArgs.length > 0 ? args[oneAtTimeCallIdArgs[0]] : null;

      if ((callId && isExecutingMap.get(callId)) || isExecuting) {
        this.logger?.debug(`Already running ${propertyName}`, {
          propertyName,
          executing: isExecuting,
        });

        return;
      }

      if (callId) {
        isExecutingMap.set(callId, true);
      } else {
        isExecuting = true;
      }

      let handler: NodeJS.Timeout | undefined;

      try {
        const execTimeout = new Promise((_, reject) => {
          handler = setTimeout(() => {
            reject(
              new Error(
                `Timeout: ${propertyName} took longer than ${timeout}ms`,
              ),
            );
          }, timeout);
        });

        return await Promise.race([method?.apply(this, args), execTimeout]);
      } catch (error) {
        this.logger.error(error);
      } finally {
        if (callId) {
          isExecutingMap.set(callId, false);
        } else {
          isExecuting = false;
        }

        if (handler !== undefined) {
          clearTimeout(handler);
        }
      }
    } as T;
  };
}
