import { Job } from '@lib/job/job';
import { Queue } from '@lib/queue';
import { QueuedJob } from '@lib/queueSchedulerService';

export interface JobManager<Context> {
  readonly name: string;
  readonly defaultQueue: Queue;

  make: (context: Context) => JobBuilder<Context>;
  schedule: (options: JobScheduleOptions, context: Context) => Promise<QueuedJob>;
  execute: (job: Job<Context>) => Promise<void>;
}

export interface JobBuilder<Context> {
  schedule: (options: JobScheduleOptions) => Promise<QueuedJob>;
}

export interface JobScheduleOptions {
  after?: Date;
  on?: Queue | string;
}
