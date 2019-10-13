import { expect } from 'chai';
import { after, before, binding, given, then, when } from 'cucumber-tsflow/dist';
import { SinonFakeTimers } from 'sinon';
import * as Sinon from 'sinon';
import { Job, JobManager } from 'src/job';
import { Queue } from 'src/queue';
import { makeQueueSchedulerService, QueuedJob, QueueSchedulerService } from 'src/queueSchedulerService';

class World {
  public fakeTimers!: SinonFakeTimers;
  public executedJobs: string[] = [];
  public queueService!: QueueSchedulerService;
  public jobManager!: JobManager<{ name: string }>;
  public queue!: Queue;
  public queuedJob!: QueuedJob;
  public realSetTimeout!: typeof setTimeout;
}

@binding([World])
class Steps {
  constructor(protected world: World) {
  }

  @before()
  public async setup() {
    this.world.realSetTimeout = setTimeout;
    this.world.fakeTimers = Sinon.useFakeTimers();
    this.world.executedJobs = [];
    this.world.queueService = makeQueueSchedulerService();
    await this.world.queueService.start();
  }

  @after()
  public async teardown() {
    await this.world.queueService.shutdown();
    this.world.fakeTimers.restore();
  }

  @given('I have a job')
  public givenIHaveAJob(): void {
    this.world.jobManager = this.world.queueService. registerJob({ name: 'job', handler: async (job: Job<{ name: string }>) => {
      this.world.executedJobs.push(job.id);
    }});
  }

  @given('I have a queue')
  public givenIHaveAQueue(): void {
    this.world.queue = this.world.queueService.registerQueue({ name: 'queue' });
  }

  @when('{int} hour elapsed')
  public whenHoursElapsed(hours: number) {
    this.world.fakeTimers.tick(hours * 60 * 60 * 1000);
  }

  @when('{int} minutes elapsed')
  public whenMinutesElapsed(minutes: number) {
    this.world.fakeTimers.tick(minutes * 60 * 1000);
  }

  @when('I schedule it on a queue')
  public async whenIScheduleItOnAQueue() {
    this.world.queuedJob = await this.world.jobManager.schedule({ on: this.world.queue }, { name: 'my-job' });
    this.world.fakeTimers.tick(1000);
  }

  @when('I schedule it on a queue in {int} hour')
  public async whenIScheduleItOnAQueueInHours(hours: number) {
    this.world.queuedJob = await this.world.jobManager.schedule({ after: relativeDate(hours * 60), on: this.world.queue }, { name: 'my-job' });
  }

  @when('I cancel the job')
  public async whenICancelTheJob() {
    await this.world.queuedJob.cancel();
  }

  @then('the job should not execute')
  public async thenTheJobShouldNotExecute() {
    expect(await this.isExecuted(this.world.queuedJob)).to.be.false;
  }

  @then('the job should execute')
  public async thenTheJobShouldExecute() {
    expect(await this.isExecuted(this.world.queuedJob)).to.be.true;
  }

  @then('the job should be scheduled')
  public async thenTheJobShouldBeScheduled() {
    expect(await this.world.queuedJob.isScheduled()).to.be.true;
  }

  @then('the job should not be scheduled')
  public async thenTheJobShouldNotBeScheduled() {
    expect(await this.world.queuedJob.isScheduled()).to.be.false;
  }

  private async isExecuted(queuedJob: QueuedJob): Promise<boolean> {
    return !!this.world.executedJobs.find((jobId) => jobId === queuedJob.id);
  }

  private async waitForExecute(): Promise<void> {
    const executeCount = this.world.executedJobs.length;
    await this.waitWithTimeout(2000, async () => this.world.executedJobs.length !== executeCount);
  }

  private async waitWithTimeout(timeout: number, check: () => Promise<boolean>): Promise<void> {
    return new Promise((resolve, reject) => {
      const checkStep = () => {
        check().then((ok) => {
          if (ok) {
            resolve();
          } else {
            this.world.realSetTimeout(() => {
              timeout -= 100;
              if (timeout <= 0) {
                resolve();
              } else {
                checkStep();
              }
            }, 100);
          }
        }).catch(reject);
      };

      checkStep();
    });
  }
}

function relativeDate(minutes: number): Date {
  const date = new Date();
  date.setTime(date.getTime() + minutes * 60 * 1000);
  return date;
}

export = Steps;
