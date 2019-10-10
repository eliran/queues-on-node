import { expect } from 'chai';
import {After, Before, Given, Then, When} from 'cucumber';
import * as Sinon from 'sinon';
import {JobFactory, JobRegistry} from '../src/job';
import {Queue} from '../src/queue';

interface ScheduleWorld {
  jobRegistry?: JobRegistry;
  jobFactory?: JobFactory<{}>;
  executedJobs: string[];
}

Before(function() {
  this.fakeTimers = Sinon.useFakeTimers();
  const world = this as ScheduleWorld;
  world.executedJobs = [];
  world.jobRegistry = new JobRegistry();
  world.jobFactory = world.jobRegistry.make('job', async (context: { name: string }) => {
    world.executedJobs.push(name);
  });
});

After(function() {
  this.fakeTimers.restore();
  if (this.queue) {
    this.queue.stop();
  }
});

Given('I have a job', function() {
  this.job = (this as ScheduleWorld).jobFactory.make({ name: 'job' });
});

Given('I have a queue', function() {
  this.queue = Queue.make();
});

When('I schedule it on a queue', function() {
  this.queue.schedule({ job: this.job });
});

Then('the job should not execute', function() {
  expect(this.job.isExecuted).to.be.false;
});

Then('the job should execute', function() {
  expect(this.job.isExecuted).to.be.true;
});

Then('the job should be scheduled', function() {
  expect(this.queue.isScheduled(this.job)).to.be.true;
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

When('I schedule it on a queue in {int} hour', function(hours) {
  this.queue.schedule({ job: this.job, after: relativeDate(hours * 60) });
});

When('I cancel the job', function() {
  this.queue.cancel(this.job);
});

function relativeDate(minutes: number): Date {
  const date = new Date();
  date.setTime(date.getTime() + minutes * 60 * 1000);
  return date;
}
