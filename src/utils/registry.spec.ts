import { expect } from 'chai';
import {} from 'sinon-chai';
import * as Sinon from 'sinon';
import { Registry } from 'src/utils/registry';

describe('Registry', function() {
  let sut!: Registry<string>;

  beforeEach(function() {
    sut = new Registry();
  });

  it('should be empty at start', function() {
    expect(sut.allNames()).to.be.empty;
    expect(sut.all()).to.be.empty;
  });

  it('should allow adding values without collision', function() {
    sut.register('a', () => 'b');
    sut.register('b', () => 'c');

    expect(sut.all()).to.eql({ a: 'b', b: 'c' });
  });

  it('should return null for key collisions and wont invoke create block', function() {
    const fn = Sinon.mock().returns('a');

    sut.register('a', () => 'b');
    expect(sut.register('a', fn)).to.be.null;
    expect(fn).to.not.been.called;
  });

  it('.getNames should return all keys', function() {
    sut.register('a', () => '1');
    sut.register('b', () => '2');

    expect(sut.allNames()).to.have.members(['a', 'b']);
  });

  it('.all should return a copy of all values', function() {
    sut.register('a', () => '1');
    sut.register('b', () => '2');

    expect(sut.all()).to.eql({ a: '1', b: '2' });
  });

  it('.get should return null if not found', function() {
    expect(sut.get('a')).to.be.null;
  });

  it('.get should return the value if found', function() {
    sut.register('a', () => '1');

    expect(sut.get('a')).to.equal('1');
  });

  it('.values should return all values', function() {
    sut.register('a', () => '1');
    sut.register('b', () => '2');
    sut.register('c', () => '1');

    expect(sut.values()).to.have.eql(['1', '2', '1']);
  });
});
