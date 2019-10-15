import { expect } from 'chai';
import {} from 'chai-as-promised';
import {} from 'sinon-chai';
import * as Sinon from 'sinon';
import { SinonFakeTimers, SinonStub } from 'sinon';
import { QueueAlreadyRegisteredError, JobAlreadyRegisteredError, NoDefaultBackendError, BackendNotRegisteredError, BackendAlreadyRegisteredError } from 'src/errors';
import { Job, JobManager } from 'src/job';
import { QueueBackend } from 'src/queue';
import { makeQueueSchedulerService, QueueSchedulerService } from 'src/queueSchedulerService';
import { SinonStubMethods, stubType } from 'src/utils/autoSinonStub';

describe('Queue Scheduler Service', function() {
  let fakeTimers!: SinonFakeTimers;
  let sut!: QueueSchedulerService;

  beforeEach(function() {
    fakeTimers = Sinon.useFakeTimers();
    sut = makeQueueSchedulerService();
  });

  afterEach(function() {
    fakeTimers.restore();
  });

  it('should return a new instance for repeated make calls', function() {
    const second = makeQueueSchedulerService();

    expect(sut).to.not.equal(second);
  });

  it('should throw if scheduling on a queue with no backend and no default backend', async function() {
    const manager = sut.registerJob({ name: 'job', handler: async (context: {}) => {} });

    return expect(manager.schedule({}, {})).to.eventually.be.rejectedWith(NoDefaultBackendError);
  });

  describe('Queue backend', function() {
    let mockBackend!: SinonStubMethods<QueueBackend>;

    beforeEach(function() {
      mockBackend = stubType();
      sut.registerBackend({ name: 'test', backend: mockBackend });
      sut.registerQueue({ name: 'test', backend: 'test' });
    });

    it('should throw if trying to register a backend with the same name', async function() {
       expect(() => sut.registerBackend({ name: 'test', backend: stubType() })).to.throw(BackendAlreadyRegisteredError);
    });

    it('should throw if queue backend isn\'t registered', async function() {
      sut.registerQueue({ name: 'my-queue', backend: 'custom' });
      const manager = sut.registerJob({ name: 'job', defaultQueue: 'my-queue', handler: async (context: {}) => {} });

      await expect(manager.schedule({}, {})).to.eventually.be.rejectedWith(BackendNotRegisteredError);
    });

    it('should start backend when service starts', async function() {
      mockBackend.start.resolves();

      await sut.start();

      expect(mockBackend.start).to.have.been.calledOnce;
      expect(mockBackend.shutdown).to.not.have.been.called;
    });

    it('should shutdown backend when service shuts down', async function() {
      mockBackend.start.resolves();
      mockBackend.shutdown.resolves();

      await sut.start();
      await sut.shutdown();

      expect(mockBackend.shutdown).to.have.been.calledOnce;
    });

    describe('with submitted job', function() {
      let stubHandler!: SinonStub;
      let manager!: JobManager<{}>;

      beforeEach(async function() {
        stubHandler = Sinon.stub();
        manager = sut.registerJob({ name: 'job', defaultQueue: 'test', handler: stubHandler });
      });

      it('should submit a job if queue backend exists', async function() {
        mockBackend.submit.resolves('submit-1');

        const queuedJob = await manager.schedule({}, {});

        expect(queuedJob).to.include({ id: 'submit-1' });
        expect(mockBackend.submit).to.have.been.calledOnceWith({ context: {}, id: 'submit-1', name: 'job' }, { after: undefined });
      });

      it('should forward #isScheduled calls to backend', async function() {
        mockBackend.submit.resolves('submit-1');
        const queuedJob = await manager.schedule({}, {});

        mockBackend.isScheduled.resolves(false);
        expect(await queuedJob.isScheduled()).to.be.false;
        mockBackend.isScheduled.resolves(true);
        expect(await queuedJob.isScheduled()).to.be.true;
      });

      it('should forward #cancel calls to backend', async function() {
          mockBackend.submit.resolves('submit-1');
          const queuedJob = await manager.schedule({}, {});

          mockBackend.cancel.resolves();
          await queuedJob.cancel();

          expect(mockBackend.cancel).to.have.been.calledOnceWith('submit-1');
      });
    });
  });

  describe('Queues', function() {
    it('should have a default queue', async function() {
      expect(sut.defaultQueue).to.be.ok;
      expect(sut.defaultQueue.name).to.equal('general');
      expect(sut.registeredQueues).to.have.key('general');
    });

    it('should be able to create a default queue with a custom name', async function() {
      const service = makeQueueSchedulerService({ defaultQueueOptions: { name: 'default' } });

      expect(service.defaultQueue.name).to.equal('default');
      expect(service.registeredQueues).to.have.key('default');
    });

    it('should be able to register a queue', async function() {
      const queue = sut.registerQueue({ name: 'my-queue' });

      expect(queue).to.be.ok;
      expect(queue.name).to.equal('my-queue');
      expect(sut.registeredQueues['my-queue']).to.equal(queue);
    });

    it('should return all registered queues in under `queues` object', async function() {
      const firstQueue = sut.registerQueue({ name: 'first_queue' });
      const secondQueue = sut.registerQueue({ name: 'second_queue' });

      expect(sut.registeredQueues).to.include.keys('first_queue', 'second_queue');
      expect(sut.registeredQueues.first_queue).to.equal(firstQueue);
      expect(sut.registeredQueues.second_queue).to.equal(secondQueue);
    });

    it('should not allow registered queue object to be changed', async function() {
      expect(() => { sut.registeredQueues.some_queue = { name: 'some_queue', backend: 'dummy' }; }).to.throw(TypeError);
      expect(sut.registeredQueues).to.not.have.key('some_queue');
    });

    it('should throw if trying to register another queue with the same name', async function() {
      sut.registerQueue({ name: 'queue' });

      expect(() => sut.registerQueue({ name: 'queue' })).to.throw(QueueAlreadyRegisteredError);
    });

  });

  describe('Jobs', function() {
    const emptyJobHandler = async (job: Job<{}>) => {};

    it('should be able to register new jobs', async function() {
      const manager = sut.registerJob({ name: 'job', handler: emptyJobHandler });

      expect(manager).to.be.ok;
      expect(manager.name).to.equal('job');
      expect(sut.registeredJobs).to.have.members(['job']);
    });

    it('should throw if trying to register jobs with same name', async function() {
      const manager = sut.registerJob({ name: 'job', handler: emptyJobHandler });

      expect(() => sut.registerJob({ name: 'job', handler: emptyJobHandler })).to.throw(JobAlreadyRegisteredError);
    });

    it('should return the default job queue', async function() {
      const manager = sut.registerJob({ name: 'job', handler: emptyJobHandler });

      expect(manager.defaultQueue).to.equal(sut.defaultQueue);
    });

    it('should allow setting a default queue for a job by passing a queue', async function() {
      const otherQueue = sut.registerQueue({ name: 'other-queue' });
      const manager = sut.registerJob({ name: 'job', defaultQueue: otherQueue, handler: emptyJobHandler });

      expect(manager.defaultQueue).to.equal(otherQueue);
    });

    it('should allow setting a default queue for a job by name', async function() {
      const otherQueue = sut.registerQueue({ name: 'other-queue' });
      const manager = sut.registerJob({ name: 'job', defaultQueue: 'other-queue', handler: emptyJobHandler });

      expect(manager.defaultQueue).to.equal(otherQueue);
    });

    it('should throw unknown queue error if passing unregistered queue', async function() {
      const otherService = makeQueueSchedulerService();
      const otherQueueOnDifferentService = otherService.registerQueue({ name: 'other-queue' });

      expect(() => sut.registerJob({ name: 'job', defaultQueue: 'other-queue', handler: emptyJobHandler })).to.throw();
      expect(() => sut.registerJob({
        name: 'job',
        defaultQueue: otherQueueOnDifferentService,
        handler: emptyJobHandler
      })).to.throw();
    });
  });
});
