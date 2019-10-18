import { expect, sinonTypeProxy } from '@test';
import { SinonFakeTimers, SinonStub } from 'sinon';
import * as Sinon from 'sinon';
import { DistributedQueueBackendAccessor } from 'src/queue/backend/accessors';
import { DistributedQueueBackend } from 'src/queue/backend/distributed';
import { QueueBackendOptions } from 'src/queue/queue';

describe('Distributed backend', function() {
  let fakeTimers!: SinonFakeTimers;
  let sut!: DistributedQueueBackend;
  let mockAccessor!: Sinon.SinonStubbedInstance<DistributedQueueBackendAccessor>;
  let mockExecuteHandler!: SinonStub;

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
    mockAccessor.registerWorker.resolves('worker-1');
    await sut.start({ executeHandler: mockExecuteHandler });

    expect(mockAccessor.registerWorker).to.have.been.calledOnce;
    expect(mockAccessor.deregisterWorker).to.not.have.been.called;
  });

  it('should not error when calling shutdown without startup', async function() {
    await expect(sut.shutdown()).to.eventually.be.fulfilled;
  });

  it('should unregister and register a new worker if calling start again', async function() {
    mockAccessor.registerWorker.resolves('worker-1');
    await sut.start({ executeHandler: mockExecuteHandler });
    await sut.start({ executeHandler: mockExecuteHandler });

    expect(mockAccessor.registerWorker).to.have.been.calledTwice;
    expect(mockAccessor.deregisterWorker).to.have.been.calledOnce;
  });

  it('should unregister worker when shutdown', async function() {
    mockAccessor.registerWorker.resolves('worker-1');
    mockAccessor.deregisterWorker.resolves();
    await sut.start({ executeHandler: mockExecuteHandler });
    await sut.shutdown();

    expect(mockAccessor.deregisterWorker).to.have.been.calledOnceWithExactly('worker-1');
  });

  describe('with started service', async function() {
    beforeEach(async function() {
      mockAccessor.registerWorker.resolves('worker-1');
      mockAccessor.generateJobId.resolves('job-1');
      await sut.start({ executeHandler: mockExecuteHandler });
    });

    it('should be able to cancel a job', async function() {
      const jobId = await sut.submit({ name: 'job', id: 'job-1', context: {} }, {});

      await sut.cancel(jobId);

      expect(mockAccessor.deleteJob).to.be.calledOnceWith(null, 'job-1');
    });

    it('should attempt to claim ownership in the normal rate (1 second)', async function() {
      mockAccessor.claimOwnership.resolves([]);
      expect(mockAccessor.claimOwnership).to.not.be.called;

      fakeTimers.tick(1000);
      expect(mockAccessor.claimOwnership).to.be.calledOnceWith('');
      mockAccessor.claimOwnership.resetHistory();

      fakeTimers.tick(1000);
      expect(mockAccessor.claimOwnership).to.be.calledOnceWith('');
    });
  });



});
