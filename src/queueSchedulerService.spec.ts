import { expect } from 'chai';
import { QueueAlreadyRegisteredError, JobAlreadyRegisteredError } from 'src/errors';
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

    describe('Queues', function() {
        it('should have a default queue', function() {
            expect(sut.defaultQueue).to.be.ok;
            expect(sut.defaultQueue.name).to.equal('general');
            expect(sut.queues).to.have.key('general');
        });

        it('should be able to create a default queue with a custom name', function() {
            const service = makeQueueSchedulerService({ defaultQueueOptions: { name: 'default' }});

            expect(service.defaultQueue.name).to.equal('default');
            expect(service.queues).to.have.key('default');
        });

        it('should be able to register a queue', function() {
            const queue = sut.registerQueue({ name: 'my-queue' });

            expect(queue).to.be.ok;
            expect(queue.name).to.equal('my-queue');
            expect(sut.queues['my-queue']).to.equal(queue);
        });

        it('should return all registered queues in under `queues` object', function() {
            const firstQueue = sut.registerQueue({ name: 'first_queue' });
            const secondQueue = sut.registerQueue({ name: 'second_queue' });

            expect(sut.queues).to.include.keys('first_queue', 'second_queue');
            expect(sut.queues.first_queue).to.equal(firstQueue);
            expect(sut.queues.second_queue).to.equal(secondQueue);
        });

        it('should not allow registered queue object to be changed', function() {
           expect(() => { sut.queues.some_queue = { name: 'some_queue', backend: 'dummy' }; }).to.throw(TypeError);
           expect(sut.queues).to.not.have.key('some_queue');
        });

        it('should throw if trying to register another queue with the same name', function() {
            sut.registerQueue({ name: 'queue' });

            expect(() => sut.registerQueue({ name: 'queue' })).to.throw(QueueAlreadyRegisteredError);
        });

    });

    describe('Jobs', function() {
        const emptyJobHandler = async (context: {}) => {};

        it('should be able to register new jobs', function() {
            const manager = sut.registerJob({ name: 'job', handler: emptyJobHandler });

            expect(manager).to.be.ok;
            expect(manager.name).to.equal('job');
            expect(sut.jobs).to.have.members(['job']);
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
