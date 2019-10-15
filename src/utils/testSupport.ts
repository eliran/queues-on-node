export { expect } from 'chai';
export {} from 'chai-as-promised';
export {} from 'sinon-chai';

import * as Sinon from 'sinon';

export function sinonTypeProxy<T>(overrides: Partial<T> = {}, base: {} = {}): Sinon.SinonStubbedInstance<T> {
  return typeProxy<T>(Sinon.stub, overrides, base) as Sinon.SinonStubbedInstance<T>;
}

// tslint:disable-next-line:ban-types
function typeProxy<T>(defaultConstructor: Function, overrides: Partial<T>, base: {}): unknown {
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
