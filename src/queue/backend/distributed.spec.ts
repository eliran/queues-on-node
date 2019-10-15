import { SinonFakeTimers } from 'sinon';
import * as Sinon from 'sinon';
import { expect } from '@lib/utils/testSupport';
import { DistributedQueueBackend, DistributedQueueBackendAccessor } from 'src/queue/backend/distributed';
import { QueueBackendOptions } from 'src/queue/queue';
import { sinonTypeProxy } from 'src/utils/sinonTypeProxy';

describe('Distributed backend', function() {
  let fakeTimers!: SinonFakeTimers;
  let sut!: DistributedQueueBackend;
  let mockAccessor!: Sinon.SinonStubbedInstance<DistributedQueueBackendAccessor>;
  let mockExecuteHandler!: QueueBackendOptions['executeHandler'];

  beforeEach(async function() {
    fakeTimers = Sinon.useFakeTimers();
    mockAccessor = sinonTypeProxy();
    mockExecuteHandler = Sinon.stub();
    sut = new DistributedQueueBackend(mockAccessor);
  });

  afterEach(function() {
    fakeTimers.restore();
  });

  it('should register worker when starting', async function() {
    mockAccessor.registerWorker.resolves('job-1');
    await sut.start({ executeHandler: mockExecuteHandler });

    expect(mockAccessor.registerWorker).to.have.been.calledOnce;
    expect(mockAccessor.deregisterWorker).to.not.have.been.called;
  });

  it('should unregister worker when shutdown', async function() {
    mockAccessor.registerWorker.resolves('job-1');
    mockAccessor.deregisterWorker.resolves();
    await sut.start({ executeHandler: mockExecuteHandler });
    await sut.shutdown();

    expect(mockAccessor.deregisterWorker).to.have.been.calledOnceWithExactly('job-1');
  });
});
