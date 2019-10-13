import { Job } from '@app/job/job';
import { QueuedJob } from '@app/queueSchedulerService';
import { ancestorWhere } from 'tslint';
import uuid from 'uuid';
import Timeout = NodeJS.Timeout;

export interface Queue {
  readonly name: string;
  readonly backend: string;
}

export interface QueueBackendScheduleOptions {
  after?: Date;
}

export interface QueueBackendOptions {
  executeHandler: (job: Job<unknown>) => Promise<void>;
}

export interface QueueBackend {
  start: (options: QueueBackendOptions) => Promise<void>;
  submit: (job: Job<unknown>, options: QueueBackendScheduleOptions) => Promise<string>;
  isScheduled: (id: string) => Promise<boolean>;
  cancel: (id: string) => Promise<void>;
  shutdown: () => Promise<void>;
}

interface ScheduledJob {
  id: string;
  job: Job<unknown>;
  after?: Date;
}

export class InMemoryQueueBackend implements QueueBackend {
  private timer: Timeout | null = null;
  private scheduledJobs: ScheduledJob[] = [];
  private executeHandler: ((job: Job<unknown>) => Promise<void>) | null = null;

  constructor(private rateInMs: number = 1000) {
  }

  public async start(options: QueueBackendOptions): Promise<void> {
    if (this.timer) {
      await this.shutdown();
    }
    this.executeHandler = options.executeHandler;
    this.timer = setInterval(this.processQueue.bind(this), this.rateInMs);
  }

  public async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.executeHandler = null;
    }
  }

  public async submit(job: Job<unknown>, options: QueueBackendScheduleOptions): Promise<string> {
    const id = uuid.v4();
    this.scheduledJobs.push({ id, job, after: options.after });
    return id;
  }

  public async isScheduled(id: string): Promise<boolean> {
    return !!await this.scheduledJobs.find((scheduledJob) => scheduledJob.id === id);
  }

  public async cancel(id: string): Promise<void> {
    this.scheduledJobs = this.scheduledJobs.filter((scheduledJob) => scheduledJob.id !== id);
  }

  private async processQueue() {
    const now = new Date().getTime();
    for (let i = this.scheduledJobs.length - 1; i >= 0; i--) {
      const options = this.scheduledJobs[i];
      if (!options.after || (now >= options.after.getTime())) {
        this.scheduledJobs.splice(i, 1);
        if (this.executeHandler) {
          await this.executeHandler(options.job);
        }
      }
    }
  }

}

// export class Queue {
//     public static make(): Queue {
//         return new Queue();
//     }
//
//     private scheduled: ScheduleOptions[] = [];
//     private timer: Timeout | null;
//     private constructor() {
//         this.timer = setInterval(this.processQueue.bind(this), 1000);
//     }
//
//     public stop() {
//         if (this.timer !== null) {
//             clearInterval(this.timer);
//             this.timer = null;
//         }
//     }
//
//     public schedule(options: ScheduleOptions) {
//         if (options.after) {
//             this.scheduled.push(options);
//         } else {
//             this.executeJob(options.job);
//         }
//     }
//
//     public cancel(job: Job<any>) {
//         this.scheduled = this.scheduled.filter((options) => options.job !== job);
//     }
//
//     public isScheduled(job: Job): boolean {
//         for (const scheduledJob of this.scheduled) {
//             if (scheduledJob.job === job) {
//                 return true;
//             }
//         }
//         return false;
//     }
//
//     private executeJob(job: Job<any>) {
//         job.execute().then(() => {}, () => {});
//     }
//
// }
