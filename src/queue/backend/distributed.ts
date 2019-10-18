import { DistributedJob, DistributedJobStatus, DistributedQueueBackendAccessor } from '@backend/accessors';
import { Job } from '@lib/job';
import { QueueBackend, QueueBackendOptions, QueueBackendScheduleOptions } from '@lib/queue';
import Timer = NodeJS.Timer;

/*
  What information do we keep for each job?
  - Job Name, Job Id & Job Context: Used to call the correct job handler with the correct information
  - Group Key: a key that groups multiple jobs
  - Queue name: The name of the queue the job got scheduled on. (From the backend perspective this could be a real independent queues or virtual queues)
  - RunAfter: The date we need to run the job after
  - UpdatedAt: The last time we updated the job's information
  - Status: scheduled, errored
  - LatestError: the latest error information
  - RetryCount: the retry count (0 when for first attempt)


  Possible actions on jobs:
  1. Enqueue a job (worker_id, job_id, queue_name, job_name, group_key, job_context, run_after)
  2. Claim jobs: return new or possible existing jobs (a worker is expected to have claimed jobs in memory. No way to retreive jobs otherwise)
  3. Delete a job: can delete a job that have a matching worker_id (including null for scheduled jobs)
  4. Refresh ownership: must match worker id
  5. UpdateErrorStatus(retry_count, error, reschedule):
    three kinds of error updates:
     a. backoff: updates the retry count and error, move back to scheduled and point to the future for retry
     b. aborted: updates the retry count and error, set the status to errored
     c. resume: reset retry count and error, set the status to scheduled
    Both types releases ownership of the errored job.



 Enqueuing a job sets its status to `scheduled`
 Claiming a job sets its status to `processing`


  Postgres:
    CREATE TYPE job_status AS ENUM ('scheduled', 'processing', 'errored');

    CREATE TABLE jobs (
      job_id uuid PRIMARY KEY,
      queue_name varchar NOT NULL,
      job_name varchar NOT NULL,
      group_key varchar,
      job_context jsonb NOT NULL,
      run_after date,
      worker_id uuid,
      status job_status NOT NULL,
      latest_error jsonb,
      retry_count int NOT NULL,
      updated_at date NOT NULL,
      created_at date NOT NULL
    );

    Indices:

     queue_name
     run_after
     updated_at

     The most performance senstive query for postgres is the claim ownership

     1. (worker_id IS NULL AND status='scheduled' AND run_after >= now())
     2. (worker_id IS NOT NULL AND updated_at <= now() - INTERVAL '30 seconds')

    indices for queries:
       (status, worker_id, run_after)
       (worker_id, updated_at)

    Each worker will have a small amount of rows active at any given time
 */
export const DISTRIBUTED_QUEUE_BACKEND_DEFAULT_MAXIMUM_CONCURRENT_JOBS = 20;
export const DISTRIBUTED_QUEUE_BACKEND_DEFAULT_NORMAL_CLAIM_RATE = 1000;
export const DISTRIBUTED_QUEUE_BACKEND_DEFAULT_RETRIES = 5;
export const DISTRIBUTED_QUEUE_BACKEND_DEFAULT_BACKOFF_TIME_IN_SECONDS = 5;

export class DistributedQueueBackend implements QueueBackend {
  private timer: Timer | null = null;
  private workerId: string | null = null;
  private jobs = new Map<string, DistributedJob>();
  private completedJobs: number = 0;
  private maximumJobsToProcess: number = DISTRIBUTED_QUEUE_BACKEND_DEFAULT_MAXIMUM_CONCURRENT_JOBS;
  private options: QueueBackendOptions | null = null;

  constructor(private accessor: DistributedQueueBackendAccessor) {}

  public async start(options: QueueBackendOptions): Promise<void> {
    if (this.timer || this.workerId) {
      await this.shutdown();
    }
    this.options = options;
    this.workerId = await this.accessor.registerWorker();
    this.timer = setInterval(this.processQueue.bind(this), DISTRIBUTED_QUEUE_BACKEND_DEFAULT_NORMAL_CLAIM_RATE);
  }

  public async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.workerId) {
      await this.accessor.deregisterWorker(this.workerId);
      this.workerId = null;
    }
  }

  public async cancel(id: string): Promise<void> {
    await this.accessor.deleteJob(null, id);
  }

  public async isScheduled(id: string): Promise<boolean> {
    switch (await this.accessor.getJobStatus(id)) {
      case DistributedJobStatus.PROCESSING:
      case DistributedJobStatus.SCHEDULED:
        return true;
      default:
        return false;
    }
  }

  public async submit(job: Job<unknown>, options: QueueBackendScheduleOptions): Promise<string> {
    const jobId = await this.accessor.generateJobId();
    await this.accessor.enqueueJob(this.workerId, {
      queueName: '',

      jobId,
      jobName: job.name,
      jobContext: job.context,

      groupKey: null,
      runAfter: options.after || null,
    });
    return jobId;
  }

  private async processQueue(): Promise<void> {
    const maximumJobsToClaim = Math.max(0, this.maximumJobsToProcess - this.jobs.size);
    if (this.shouldClaimNewJobs() && this.workerId && maximumJobsToClaim > 0) {
      const potentialNewJobs = await this.accessor.claimOwnership(this.workerId,  maximumJobsToClaim);
      const newJobs = potentialNewJobs.filter((job) => !this.jobs.has(job.jobId));
      // Not awaiting promises from the forEach block as they need to run in parallel
      newJobs.forEach(this.processJob.bind(this));
    }
  }

  private async processJob(job: DistributedJob): Promise<void> {
    try {
      if (this.options) {
        await this.options.executeHandler({
          id: job.jobId,
          name: job.jobName,
          context: job.jobContext,
        } as Job<unknown>);
      }
      await this.jobCompleted(job);
    } catch (e) {
      await this.jobFailed(job, e);
    }
  }

  private async jobCompleted(job: DistributedJob): Promise<void> {
    if (this.workerId) {
      await this.accessor.deleteJob(this.workerId, job.jobId);
    }
    this.jobs.delete(job.jobId);
  }

  private async jobFailed(job: DistributedJob, error: Error): Promise<void> {
    if (!this.workerId) { return; }
    /*
      1. If job has retry attempts left (the job type has this configuration), schedule a retry
          a. if the retry time is below a threshold (like < 5 seconds), add this job to an internal priority queue for errors
          b. otherwise, reschedule the job in the queue using backoff
      2. If retry attempts left, error the job
     */
    if (job.retryAttempts >= DISTRIBUTED_QUEUE_BACKEND_DEFAULT_RETRIES) {
      console.log(`Error: ${error}`, error);

      await this.accessor.errorOwnedJob(this.workerId, job.jobId, { error: { name: error.name, message: error.message, stack: error.stack } });
    } else {
      await this.accessor.backoffOwnedJob(this.workerId, job.jobId, job.retryAttempts + 1, DISTRIBUTED_QUEUE_BACKEND_DEFAULT_BACKOFF_TIME_IN_SECONDS);
    }
  }

  private shouldClaimNewJobs(): boolean {
    return this.jobs.size <= (this.maximumJobsToProcess / 2);
  }
}
