import { BackendAlreadyRegisteredError, BackendNotRegisteredError, JobAlreadyRegisteredError, NoDefaultBackendError, QueueAlreadyRegisteredError, QueueNotRegisteredError, UnknownJobError } from '@lib/errors';
import { Job, JobManager, JobScheduleOptions } from '@lib/job';
import { Queue, QueueBackend } from '@lib/queue';
import { Local } from '@backend/local';
import { Registry } from '@lib/utils';

export interface QueueSchedulerService {
  readonly defaultQueue: Queue;
  readonly registeredQueues: { [name: string]: Queue };
  readonly registeredJobs: string[];

  start(): Promise<void>;

  shutdown(): Promise<void>;

  registerBackend(options: RegisterBackendOptions): QueueBackend;

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
 * @param backend optional backend this queue runs on
 */
export interface RegisterQueueOptions {
  name: string;
  backend?: string;
}

export interface RegisterBackendOptions {
  name: string;
  backend: QueueBackend;
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
  private queues = new Registry<Queue>();
  private jobs = new Registry<JobManager<any>>();
  private backends = new Registry<QueueBackend>();
  private defaultBackend: string | null = null;

  public readonly defaultQueue: Queue;

  constructor(options: QueueSchedulerOptions = {}) {
    this.defaultQueue = this.registerQueue(options.defaultQueueOptions || { name: 'general' });
  }

  public async shutdown(): Promise<void> {
    for (const backend of this.backends.values()) {
      await backend.shutdown();
    }
  }

  public async start(): Promise<void> {
    for (const backend of this.backends.values()) {
      await backend.start({ executeHandler: this.executeJob.bind(this) });
    }
  }

  get registeredQueues(): { [name: string]: Queue } {
    return this.queues.all();
  }

  get registeredJobs(): string[] {
    return this.jobs.allNames();
  }

  public registerBackend(options: RegisterBackendOptions): QueueBackend {
    const backend = this.backends.register(options.name, () => options.backend);
    if (!backend) {
      throw new BackendAlreadyRegisteredError(options.name);
    }
    if (!this.defaultBackend) {
      this.defaultBackend = options.name;
    }
    return backend;
  }

  public registerQueue(options: RegisterQueueOptions): Queue {
    const makeQueue = () => Object.freeze({
      name: options.name,
      backend: options.backend || null,
    } as Queue);
    const queue = this.queues.register(options.name, makeQueue);
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
            const backend = this.resolveBackend(queue.backend);

            const job = {
              id: '',
              name: manager.name,
              context,
            };

            const id = await backend.submit(job, { after: scheduleOptions.after });
            job.id = id;

            return {
              id,
              queue,

              isScheduled: async () => backend.isScheduled(id),
              cancel: async () => backend.cancel(id),
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

    const jobManager = this.jobs.register(options.name, makeJobManager);
    if (!jobManager) { throw new JobAlreadyRegisteredError(options.name); }
    return jobManager;
  }

  private resolveQueue(queue?: Queue | string, defaultQueue: Queue = this.defaultQueue): Queue {
    if (!queue) { return defaultQueue; }
    const queueName = typeof queue === 'string' ? queue : queue.name;
    const resolvedQueue = this.queues.get(queueName);
    if (!resolvedQueue) {
      throw new QueueNotRegisteredError(queueName);
    }
    return resolvedQueue;
  }

  private resolveBackend(backendName: string | null): QueueBackend {
    backendName = backendName || this.defaultBackend;
    if (!backendName) {
      throw new NoDefaultBackendError();
    }
    const backend = this.backends.get(backendName);
    if (!backend) {
      throw new BackendNotRegisteredError(backendName);
    }
    return backend;
  }

  private async executeJob(job: Job<unknown>): Promise<void> {
    const manager = this.jobs.get(job.name);
    if (!manager) {
      throw new UnknownJobError(job.name);
    }
    await manager.execute(job);
  }
}
