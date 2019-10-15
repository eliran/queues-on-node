import { SinonStub } from 'sinon';
import * as Sinon from 'sinon';

interface TypedStub<R> extends SinonStub {}
type Method<R> = (...args: any[]) => R;
type AsyncLikeMethod<R> = (...args: any[]) => PromiseLike<R>;
type AsyncMethod<R> = (...args: any[]) => Promise<R>;
type StubIfMethod<MethodType> = MethodType extends AsyncMethod<infer R0>
  ? TypedStub<R0>                                  // Stub out async method
  : (MethodType extends AsyncLikeMethod<infer R1>
    ? TypedStub<R1>                              // Stub out async-like method
    : (MethodType extends Method<infer R2>
      ? TypedStub<R2>                          // Stub out normal method
      : MethodType));                          // Not a method; don't stub
export type SinonStubMethods<T> = { [K in keyof T]: StubIfMethod<T[K]> };
export type SinonStubMethodsOfObjects<T> = { [K in keyof T]: SinonStubMethods<T[K]> };

// export function stubType<T>(overrides: Partial<T> = {}, base: {} = {}): SinonStubMethodsOfObjects<T> {
//   return getDefault<T>(getMock, overrides, base) as SinonStubMethodsOfObjects<T>;
// }

export function stubType<T>(overrides: Partial<T> = {}, base: {} = {}): SinonStubMethods<T> {
  return getDefault<T>(Sinon.stub, overrides, base) as SinonStubMethods<T>;
}

// tslint:disable-next-line:ban-types
function getDefault<T>(defaultConstructor: Function, overrides: Partial<T>, base: {}): unknown {
  const stubs = Object.assign(base, overrides);
  return new Proxy(stubs, {
    get(target: T, p: string | number | symbol, receiver: unknown): unknown {
      if (!(p in stubs)) {
        // @ts-ignore
        stubs[p] = defaultConstructor();
      }
      // @ts-ignore
      return stubs[p];
    },
  }) as unknown;
}
