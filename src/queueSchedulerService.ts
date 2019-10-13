import { JobAlreadyRegisteredError, QueueAlreadyRegisteredError, QueueNotRegisteredError, UnknownJobError } from '@lib/errors';
import { Job, JobManager, JobScheduleOptions } from '@lib/job';
import { Queue, QueueBackend } from '@lib/queue';
import { Local } from '@backend/local';
import { Registry } from '@lib/utils';

export interface QueueSchedulerService {
  readonly defaultQueue: Queue;
  readonly queues: { [name: string]: Queue };
  readonly jobs: string[];

  start(): Promise<void>;

  shutdown(): Promise<void>;

  registerQueue(options: RegisterQueueOptions): Queue;

  registerJob<Context>(options: RegisterJobOptions<Context>): JobManager<Context>;
}

/**
 * @param name The job's unique name
 * @param defaultQueue Optional default queue, if not specified the uses the scheduler default queue
 */
export interface RegisterJobOptions<Context> {
  name: string;
  defaultQueue?: Queue | string;
  handler: JobHandler<Context>;
}

/**
 * @param name The queue's unique name
 */
export interface RegisterQueueOptions {
  name: string;
}

export type JobHandler<Context> = (job: Job<Context>) => Promise<void>;

export interface QueuedJob {
  readonly id: string;
  readonly queue: Queue;

  isScheduled: () => Promise<boolean>;
  cancel: () => Promise<void>;
}

export interface QueueSchedulerOptions {
  defaultQueueOptions?: RegisterQueueOptions;
}

export function makeQueueSchedulerService(options: QueueSchedulerOptions = {}): QueueSchedulerService {
  return new QueueSchedulerServiceImp(options);
}

class QueueSchedulerServiceImp implements QueueSchedulerService {
  private queueRegistry = new Registry<Queue>();
  private backend: QueueBackend = new Local();
  private jobRegistry = new Registry<JobManager<any>>();

  public readonly defaultQueue: Queue;

  constructor(options: QueueSchedulerOptions = {}) {
    this.defaultQueue = this.registerQueue(options.defaultQueueOptions || { name: 'general' });
  }

  public shutdown(): Promise<void> {
    return this.backend.shutdown();
  }

  public start(): Promise<void> {
    return this.backend.start({ executeHandler: this.executeJob.bind(this) });
  }

  get queues(): { [name: string]: Queue } {
    return this.queueRegistry.all();
  }

  get jobs(): string[] {
    return this.jobRegistry.allNames();
  }

  public registerQueue(options: RegisterQueueOptions): Queue {
    const makeQueue = () => Object.freeze({
      name: options.name,
      backend: 'in-memory',
    } as Queue);
    const queue = this.queueRegistry.register(options.name, makeQueue);
    if (!queue) { throw new QueueAlreadyRegisteredError(options.name); }
    return queue;
  }

  public registerJob<Context>(options: RegisterJobOptions<Context>): JobManager<Context> {
    const makeJobManager = () => {
      const defaultQueue = this.resolveQueue(options.defaultQueue);
      const manager = Object.freeze({
        name: options.name,
        defaultQueue,

        make: (context: Context) => ({
          schedule: async (scheduleOptions: JobScheduleOptions): Promise<QueuedJob> => {
            const queue = this.resolveQueue(scheduleOptions.on, defaultQueue);

            const job = {
              id: '',
              name: manager.name,
              context,
            };

            const id = await this.backend.submit(job, { after: scheduleOptions.after });
            job.id = id;

            return {
              id,
              queue,

              isScheduled: async () => this.backend.isScheduled(id),
              cancel: async () => this.backend.cancel(id),
            };
          },
        }),

        schedule: async (scheduleOptions: JobScheduleOptions, context: Context): Promise<QueuedJob> => {
          return manager.make(context).schedule(scheduleOptions);
        },

        execute: async (job: Job<Context>) => {
          return options.handler(job);
        },
      } as JobManager<Context>);
      return manager;
    };

    const jobManager = this.jobRegistry.register(options.name, makeJobManager);
    if (!jobManager) { throw new JobAlreadyRegisteredError(options.name); }
    return jobManager;
  }

  private resolveQueue(queue?: Queue | string, defaultQueue: Queue = this.defaultQueue): Queue {
    if (!queue) { return defaultQueue; }
    const queueName = typeof queue === 'string' ? queue : queue.name;
    const resolvedQueue = this.queueRegistry.get(queueName);
    if (!resolvedQueue) {
      throw new QueueNotRegisteredError(queueName);
    }
    return resolvedQueue;
  }

  private async executeJob(job: Job<unknown>): Promise<void> {
    const manager = this.jobRegistry.get(job.name);
    if (!manager) {
      throw new UnknownJobError(job.name);
    }
    await manager.execute(job);
  }
}
