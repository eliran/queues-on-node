import { expect } from 'chai';
import {After, Before, Given, Then, When} from 'cucumber';
import * as Sinon from 'sinon';
import { JobManager } from 'src/job';
import { makeQueueSchedulerService, QueuedJob, QueueSchedulerService } from 'src/queueSchedulerService';

interface ScheduleWorld {
  queueService: QueueSchedulerService;
  jobManager: JobManager<{ name: string }>;
  queueJob: QueuedJob;
  executedJobs: string[];
}

Before(function() {
  this.fakeTimers = Sinon.useFakeTimers();
  const world = this as ScheduleWorld;
  world.executedJobs = [];
  world.queueService = makeQueueSchedulerService();
});

After(function() {
  const world = this as ScheduleWorld;
  this.fakeTimers.restore();
  // world.queueService.shutdown();
});

Given('I have a job', function() {
  const world = this as ScheduleWorld;
  world.jobManager = world.queueService.registerJob({ name: 'job', handler: async (context: { name: string }) => {
    world.executedJobs.push(context.name);
  }});
});

Given('I have a queue', function() {
  this.queue = (this as ScheduleWorld).queueService.registerQueue({ name: 'queue' });
});

Then('the job should not execute', function() {
  expect(this.queuedJob.isExecuted).to.be.false;
});

Then('the job should execute', function() {
  expect(this.queuedJob.isExecuted).to.be.true;
});

Then('the job should be scheduled', function() {
  expect(this.queuedJob.isScheduled(this.job)).to.be.true;
});

Then('the job should not be scheduled', function() {
  expect(this.queue.isScheduled(this.job)).to.be.false;
});

When('{int} hour elapsed', function(hours) {
  this.fakeTimers.tick(hours * 60 * 60 * 1000);
});

When('{int} minutes elapsed', function(minutes) {
  this.fakeTimers.tick(minutes * 60 * 1000);
});

When('I schedule it on a queue', async function() {
  this.queuedJob = await (this as ScheduleWorld).jobManager.schedule({ on: this.queue }, { name: 'my-job' });
});

When('I schedule it on a queue in {int} hour', async function(hours) {
  this.queuedJob = await (this as ScheduleWorld).jobManager.schedule({ after: relativeDate(hours * 60), on: this.queue }, { name: 'my-job' });
});

When('I cancel the job', function() {
  this.queue.cancel(this.job);
});

function relativeDate(minutes: number): Date {
  const date = new Date();
  date.setTime(date.getTime() + minutes * 60 * 1000);
  return date;
}
