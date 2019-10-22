import { expect } from '@test';
import { SinonFakeTimers, SinonStub } from 'sinon';
import * as Sinon from 'sinon';
import { Job } from 'src/job';

import { Local } from 'src/queue/backend/local';

describe('Local backend', function() {
  let sut!: Local;
  let fakeTimers!: SinonFakeTimers;
  let mockExecuteHandler: SinonStub;

  beforeEach(async function() {
    fakeTimers = Sinon.useFakeTimers();
    sut = new Local();
    mockExecuteHandler = Sinon.stub();

    await sut.start({ executeHandler: mockExecuteHandler });
  });

  afterEach(function() {
    fakeTimers.restore();
  });

  it('should return a new job id for each submissions', async function() {
    const firstJobId = await sut.submit(makeJobMock(), {});
    const secondJobId = await sut.submit(makeJobMock(), {});

    expect(firstJobId).is.not.equal(secondJobId);
  });

  it('should trigger a job in the internal refresh rate', async function() {
    const job = makeJobMock();
    await sut.submit(job, {});
    expect(mockExecuteHandler).to.not.have.been.called;

    fakeTimers.tick(1000);

    expect(mockExecuteHandler).to.have.been.calledOnceWith(job);
  });

  it('should trigger multiple jobs if expired at the same time', async function() {
    const jobs = [makeJobMock('job1'), makeJobMock('job2')];

    for (const job of jobs) {
      await sut.submit(job, {});
    }

    expect(mockExecuteHandler).to.not.have.been.called;

    fakeTimers.tick(1000);
    await Promise.resolve();

    expect(mockExecuteHandler).to.have.been.calledTwice;
    expect(mockExecuteHandler).to.have.been.calledWith({ context: {}, id: 'job1', name: 'job' });
    expect(mockExecuteHandler).to.have.been.calledWith({ context: {}, id: 'job2', name: 'job' });
  });

  it('should trigger a job after expiration time', async function() {
    const ms2Minutes = 2 * 60 * 1000;
    const in2Minutes = new Date();
    in2Minutes.setTime(in2Minutes.getTime() + ms2Minutes);
    await sut.submit(makeJobMock(), { after: in2Minutes });

    fakeTimers.tick(ms2Minutes - 1);
    expect(mockExecuteHandler).to.not.have.been.called;

    fakeTimers.tick(1);
    expect(mockExecuteHandler).to.have.been.calledOnce;
  });

  it('should not trigger a job after shutdown', async function() {
    await sut.submit(makeJobMock(), {});

    await sut.shutdown();

    fakeTimers.tick(10000);

    expect(mockExecuteHandler).to.not.have.been.called;
  });

  it('should allow selecting the refresh rate', async function() {
    const executeStub = Sinon.stub();
    const sutWithFasterRate = new Local(100);
    await sutWithFasterRate.start({ executeHandler: executeStub });

    await sutWithFasterRate.submit(makeJobMock(), {});
    fakeTimers.tick(100);

    expect(executeStub).to.have.been.called;

    await sutWithFasterRate.shutdown();
  });

  it('should trigger the new handler if #start is called again', async function() {
    const executeStub = Sinon.stub();
    await sut.submit(makeJobMock(), {});
    await sut.start({ executeHandler: executeStub });

    fakeTimers.tick(1000);

    expect(executeStub).to.have.been.called;
    expect(mockExecuteHandler).to.not.have.been.called;
  });

  it('#isScheduled should return false if not scheduled', async function() {
    expect(await sut.isScheduled('job1')).to.be.false;
  });

  it('#isScheduled should return scheduled status', async function() {
    const jobId = await sut.submit(makeJobMock(), {});

    expect(await sut.isScheduled(jobId)).to.be.true;

    fakeTimers.tick(1000);

    expect(await sut.isScheduled(jobId)).to.be.false;
  });

  it('#cancel should cancel a scheduled job', async function() {
    const jobId = await sut.submit(makeJobMock(), {});

    await sut.cancel(jobId);

    expect(await sut.isScheduled(jobId)).to.be.false;
    expect(mockExecuteHandler).to.not.have.been.called;
  });

  function makeJobMock(id: string = 'job'): Job<{}> {
    return {
      id,
      name: 'job',
      context: {},
    } as Job<string>;
  }
});
