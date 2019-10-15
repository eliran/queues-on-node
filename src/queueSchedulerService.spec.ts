import { expect } from 'chai';
import {} from 'chai-as-promised';
import { QueueAlreadyRegisteredError, JobAlreadyRegisteredError, NoDefaultBackendError, BackendNotRegisteredError } from 'src/errors';
import { Job } from 'src/job';
import { makeQueueSchedulerService, QueueSchedulerService } from 'src/queueSchedulerService';

describe('Queue Scheduler Service', function() {
    let sut: QueueSchedulerService;

    beforeEach(function() {
        sut = makeQueueSchedulerService();
    });

    it('should return a new instance for repeated make calls', function() {
        const second = makeQueueSchedulerService();

        expect(sut).to.not.equal(second);
    });

    it('should throw if scheduling on a queue with no backend and no default backend', async function() {
        const manager = sut.registerJob({ name: 'job', handler: async (context: {}) => {} });

        return expect(manager.schedule({}, {})).to.eventually.be.rejectedWith(NoDefaultBackendError);
    });

    it('should throw if queue backend isn\'t registered', async function() {
        sut.registerQueue({ name: 'my-queue', backend: 'custom' });
        const manager = sut.registerJob({ name: 'job', defaultQueue: 'my-queue', handler: async (context: {}) => {} });

        return expect(manager.schedule({}, {})).to.eventually.be.rejectedWith(BackendNotRegisteredError);
    });

    describe('Queues', function() {
        it('should have a default queue', function() {
            expect(sut.defaultQueue).to.be.ok;
            expect(sut.defaultQueue.name).to.equal('general');
            expect(sut.registeredQueues).to.have.key('general');
        });

        it('should be able to create a default queue with a custom name', function() {
            const service = makeQueueSchedulerService({ defaultQueueOptions: { name: 'default' }});

            expect(service.defaultQueue.name).to.equal('default');
            expect(service.registeredQueues).to.have.key('default');
        });

        it('should be able to register a queue', function() {
            const queue = sut.registerQueue({ name: 'my-queue' });

            expect(queue).to.be.ok;
            expect(queue.name).to.equal('my-queue');
            expect(sut.registeredQueues['my-queue']).to.equal(queue);
        });

        it('should return all registered queues in under `queues` object', function() {
            const firstQueue = sut.registerQueue({ name: 'first_queue' });
            const secondQueue = sut.registerQueue({ name: 'second_queue' });

            expect(sut.registeredQueues).to.include.keys('first_queue', 'second_queue');
            expect(sut.registeredQueues.first_queue).to.equal(firstQueue);
            expect(sut.registeredQueues.second_queue).to.equal(secondQueue);
        });

        it('should not allow registered queue object to be changed', function() {
           expect(() => { sut.registeredQueues.some_queue = { name: 'some_queue', backend: 'dummy' }; }).to.throw(TypeError);
           expect(sut.registeredQueues).to.not.have.key('some_queue');
        });

        it('should throw if trying to register another queue with the same name', function() {
            sut.registerQueue({ name: 'queue' });

            expect(() => sut.registerQueue({ name: 'queue' })).to.throw(QueueAlreadyRegisteredError);
        });

    });

    describe('Jobs', function() {
        const emptyJobHandler = async (job: Job<{}>) => {};

        it('should be able to register new jobs', function() {
            const manager = sut.registerJob({ name: 'job', handler: emptyJobHandler });

            expect(manager).to.be.ok;
            expect(manager.name).to.equal('job');
            expect(sut.registeredJobs).to.have.members(['job']);
        });

        it('should throw if trying to register jobs with same name', function() {
            const manager = sut.registerJob({ name: 'job', handler: emptyJobHandler });

            expect(() => sut.registerJob({ name: 'job', handler: emptyJobHandler })).to.throw(JobAlreadyRegisteredError);
        });

        it('should return the default job queue', function() {
            const manager = sut.registerJob({ name: 'job', handler: emptyJobHandler });

            expect(manager.defaultQueue).to.equal(sut.defaultQueue);
        });

        it('should allow setting a default queue for a job by passing a queue', function() {
            const otherQueue = sut.registerQueue({ name: 'other-queue' });
            const manager = sut.registerJob({ name: 'job', defaultQueue: otherQueue, handler: emptyJobHandler });

            expect(manager.defaultQueue).to.equal(otherQueue);
        });

        it('should allow setting a default queue for a job by name', function() {
            const otherQueue = sut.registerQueue({ name: 'other-queue' });
            const manager = sut.registerJob({ name: 'job', defaultQueue: 'other-queue', handler: emptyJobHandler });

            expect(manager.defaultQueue).to.equal(otherQueue);
        });

        it('should throw unknown queue error if passing unregistered queue', function() {
            const otherService = makeQueueSchedulerService();
            const otherQueueOnDifferentService = otherService.registerQueue({ name: 'other-queue' });

            expect(() => sut.registerJob({ name: 'job', defaultQueue: 'other-queue', handler: emptyJobHandler })).to.throw();
            expect(() => sut.registerJob({ name: 'job', defaultQueue: otherQueueOnDifferentService, handler: emptyJobHandler })).to.throw();
        });
    });
});
