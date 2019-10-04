import { hello, helloDependency } from '@app/index';
import { expect } from 'chai';
import * as Sinon from 'sinon';

describe('Hello function', () => {
  it('should return hello world', () => {
    const result = hello();
    expect(result).to.equal('Hello World');
  });

  it('can be mocked', () => {
      const stub = Sinon.stub(helloDependency, 'message').returns('Something else');

      const result = hello();
      expect(result).to.equal('Something else');

      stub.restore();
  });
});
