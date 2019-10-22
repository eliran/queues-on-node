import { Job } from '@lib/job';

export interface Queue {
  readonly name: string;
  readonly backend: string | null;
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
