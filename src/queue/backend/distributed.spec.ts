import { distributedJobFactory, expect, sinonTypeProxy } from '@test';
import { SinonFakeTimers, SinonStub } from 'sinon';
import * as Sinon from 'sinon';
import { DistributedJob, DistributedJobStatus, DistributedQueueBackendAccessor } from 'src/queue/backend/accessors';
import { DISTRIBUTED_QUEUE_BACKEND_DEFAULT_BACKOFF_TIME_IN_SECONDS, DISTRIBUTED_QUEUE_BACKEND_DEFAULT_MAXIMUM_CONCURRENT_JOBS, DISTRIBUTED_QUEUE_BACKEND_DEFAULT_RETRIES, DistributedQueueBackend } from 'src/queue/backend/distributed';

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

      normalRateTick();
      expect(mockAccessor.claimOwnership).to.be.calledOnceWith('worker-1', DISTRIBUTED_QUEUE_BACKEND_DEFAULT_MAXIMUM_CONCURRENT_JOBS);
      mockAccessor.claimOwnership.resetHistory();

      normalRateTick();
      expect(mockAccessor.claimOwnership).to.be.calledOnceWith('worker-1', DISTRIBUTED_QUEUE_BACKEND_DEFAULT_MAXIMUM_CONCURRENT_JOBS);
    });

    it('should invoke job handler for claimed job', async function() {
      const job = distributedJobFactory.build();

      await simulateClaimOwnershipWithJobs([job]);

      expect(mockExecuteHandler).to.be.calledOnceWith({
        id: job.jobId,
        name: job.jobName,
        context: job.jobContext,
      });
    });

    it('should delete a completed job', async function() {
      mockAccessor.deleteJob.resolves();
      const job = distributedJobFactory.build();

      await simulateClaimOwnershipWithJobs([job]);

      expect(mockAccessor.deleteJob).to.be.calledOnceWith('worker-1', job.jobId);
    });

    it('should backoff a job if errored', async function() {
      mockAccessor.backoffOwnedJob.resolves();
      mockExecuteHandler.rejects();
      const job = distributedJobFactory.build();

      await simulateClaimOwnershipWithJobs([job]);

      expect(mockAccessor.backoffOwnedJob).to.be.calledOnceWith('worker-1', job.jobId, job.retryAttempts + 1, DISTRIBUTED_QUEUE_BACKEND_DEFAULT_BACKOFF_TIME_IN_SECONDS);
    });

    it('should error if a job had too many retries', async function() {
      mockAccessor.errorOwnedJob.resolves();
      mockExecuteHandler.rejects(new Error('some error'));
      const job = distributedJobFactory.build({ retryAttempts: DISTRIBUTED_QUEUE_BACKEND_DEFAULT_RETRIES });

      await simulateClaimOwnershipWithJobs([job]);

      expect(mockAccessor.errorOwnedJob).to.be.calledOnceWith('worker-1', job.jobId);
      expect(mockAccessor.errorOwnedJob.firstCall.args[2]).to.have.key('error')
        .and.nested.include({ 'error.name': 'Error', 'error.message': 'some error' });
      expect((mockAccessor.errorOwnedJob.firstCall.args[2] as { error: {} }).error).to.keys('stack', 'name', 'message');
    });

    [ { status: DistributedJobStatus.SCHEDULED, expectedResponse: true },
      { status: DistributedJobStatus.ERRORED, expectedResponse: false },
      { status: DistributedJobStatus.PROCESSING, expectedResponse: true } ].forEach((testCase) => {
       it(`#isScheduled for a "${testCase.status}" job should be ${testCase.expectedResponse}`, async function() {
          mockAccessor.getJobStatus.resolves(testCase.status);

          await expect(sut.isScheduled('job-1')).to.become(testCase.expectedResponse);
          await expect(mockAccessor.getJobStatus).to.be.calledOnceWith('job-1');
       });
    });

    /*
      1. Test deregister worker when a job is in progress
      2. accessor returning error for different operations and the current handling of them
      3. Check filling up work queue refill queue rules
      4. Check quick refill rules when jobs complete
     */
    async function simulateClaimOwnershipWithJobs(jobs: DistributedJob[]): Promise<void> {
      mockAccessor.claimOwnership.resolves(jobs);
      normalRateTick();
      await Promise.resolve();
    }

    function normalRateTick() {
      fakeTimers.tick(1000);
    }
  });
});
