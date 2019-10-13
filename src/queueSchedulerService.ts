///
import { QueueAlreadyExists, QueueNotRegistered } from '@app/errors';
import { JobAlreadyRegisteredError, JobManager, JobScheduleOptions } from '@app/job';
import { Queue } from '@app/queue';
import { Registry } from '@app/utils/registry';

export interface QueueSchedulerService {
    readonly defaultQueue: Queue;
    readonly queues: { [name: string]: Queue };
    readonly jobs: string[];
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

export type JobHandler<Context> = (context: Context) => Promise<void>;

export interface QueuedJob {
}

export interface QueueSchedulerOptions {
    defaultQueueOptions?: RegisterQueueOptions;
}
export function makeQueueSchedulerService(options: QueueSchedulerOptions = {}): QueueSchedulerService {
    return new QueueSchedulerServiceImp(options);
}

class QueueSchedulerServiceImp implements QueueSchedulerService {
    private queueRegistry = new Registry<Queue>();
    private jobRegistry = new Registry<JobManager<any>>();

    public readonly defaultQueue: Queue;

    constructor(options: QueueSchedulerOptions = {}) {
        this.defaultQueue = this.registerQueue(options.defaultQueueOptions || { name: 'general' });
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
        });
        const queue = this.queueRegistry.register(options.name, makeQueue);
        if (!queue) { throw new QueueAlreadyExists(options.name); }
        return queue;
    }

    public registerJob<Context>(options: RegisterJobOptions<Context>): JobManager<Context> {
        const makeJobManager = () => {
            return Object.freeze({
                name: options.name,
                defaultQueue: this.resolveQueue(options.defaultQueue),

                make: (context: Context) => ({
                    schedule: async (scheduleOptions: JobScheduleOptions): Promise<QueuedJob> => ({}),
                }),
                schedule: async (scheduleOptions: JobScheduleOptions, context: Context): Promise<QueuedJob> => ({}),
            } as JobManager<Context>);
        };

        const jobManager = this.jobRegistry.register(options.name, makeJobManager);
        if (!jobManager) { throw new JobAlreadyRegisteredError(options.name); }

        return jobManager;
    }

    private resolveQueue(queue?: Queue | string): Queue {
        if (!queue) { return this.defaultQueue; }
        const queueName = typeof queue === 'string' ? queue : queue.name;
        const resolvedQueue = this.queueRegistry.get(queueName);
        if (!resolvedQueue) {
            throw new QueueNotRegistered(queueName);
        }
        return resolvedQueue;
    }
}
