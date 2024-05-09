const stakingModuleId = Symbol('StakingModuleId');

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

export function OneAtTime<T extends (...args: any[]) => Promise<any>>() {
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
        return await method?.apply(this, args);
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
