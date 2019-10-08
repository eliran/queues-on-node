import { expect } from 'chai';
import {After, Before, Given, Then, When} from 'cucumber';
import * as Sinon from 'sinon';

class Job {
  public static make(): Job {
    return new Job();
  }

  private executed = false;
  private constructor() {}

  get isExecuted(): boolean {
    return this.executed;
  }

  public async execute(): Promise<void> {
    this.executed = true;
  }
}

interface ScheduleOptions {
  job: Job;
  after?: Date;
}

class Queue {
  public static make(): Queue {
    return new Queue();
  }

  private scheduled: ScheduleOptions[] = [];
  private constructor() {
    setInterval(this.processQueue.bind(this), 1000);
  }

  public schedule(options: ScheduleOptions) {
    if (options.after) {
      this.scheduled.push(options);
    } else {
      this.executeJob(options.job);
    }
  }

  public cancel(job: Job) {
    this.scheduled = this.scheduled.filter((options) => options.job !== job);
  }

  public isScheduled(job: Job): boolean {
    for (const scheduledJob of this.scheduled) {
      if (scheduledJob.job === job) {
        return true;
      }
    }
    return false;
  }

  private executeJob(job: Job) {
    job.execute().then(() => {}, () => {});
  }

  private processQueue() {
    const now = new Date().getTime();
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      const options = this.scheduled[i];
      if (!options.after || (now >= options.after.getTime())) {
        this.scheduled.splice(i, 1);
        this.executeJob(options.job);
      }
    }
  }
}

Before(function() {
  this.fakeTimers = Sinon.useFakeTimers();
});

After(function() {
  this.fakeTimers.restore();
});

Given('I have a job', function() {
  this.job = Job.make();
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
