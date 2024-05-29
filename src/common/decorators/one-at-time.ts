import 'reflect-metadata';
const stakingModuleId = Symbol('StakingModuleId');

/**
 * A decorator that marks a specific parameter in a method for identifying the staking module ID
 */
export function StakingModuleId(
  target: any,
  propertyKey: string | symbol,
  parameterIndex: number,
) {
  const existingMetadata: number[] =
    Reflect.getOwnMetadata(stakingModuleId, target, propertyKey) || [];

  if (existingMetadata.length === 0) {
    Reflect.defineMetadata(
      stakingModuleId,
      [parameterIndex],
      target,
      propertyKey,
    );
  } else {
    throw new Error(
      `StakingModuleId decorator can only be applied to one parameter in method ${String(
        propertyKey,
      )}. It is already applied to parameter index ${existingMetadata[0]}`,
    );
  }
}

/**
 * A decorator factory that produces a method decorator ensuring a function executes one at a time.
 * Calls to the decorated method are restricted so that only one instance can be executed concurrently,
 * either globally or per staking module ID
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
      const stakingModuleIdArgs =
        Reflect.getMetadata(stakingModuleId, target, propertyName) || [];

      const moduleId =
        stakingModuleIdArgs.length > 0 ? args[stakingModuleIdArgs[0]] : null;

      if ((moduleId && isExecutingMap.get(moduleId)) || isExecuting) {
        this.logger?.debug(`Already running ${propertyName}`, {
          propertyName,
          executing: isExecuting,
        });

        return;
      }

      if (moduleId) {
        isExecutingMap.set(moduleId, true);
      } else {
        isExecuting = true;
      }

      try {
        const execTimeout = new Promise((_, reject) => {
          setTimeout(() => {
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
        if (moduleId) {
          isExecutingMap.set(moduleId, false);
        } else {
          isExecuting = false;
        }
      }
    } as T;
  };
}
