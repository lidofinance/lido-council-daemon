/* eslint-disable @typescript-eslint/ban-types */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends Function ? T[P] : DeepReadonly<T[P]>;
};
