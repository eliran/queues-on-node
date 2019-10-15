import { Job } from '@lib/job';
import { QueueBackend, QueueBackendOptions, QueueBackendScheduleOptions } from '@lib/queue';
import uuid = require('uuid');
import Timer = NodeJS.Timer;

export class DistributedQueueBackend implements QueueBackend {
  private timer: Timer | null = null;
  private workerId: string | null = null;
  private jobs = new Map<string, DistributedJob>();
  private completedJobs: number = 0;
  private maximumJobsToProcess: number = 20;

  constructor(private accessor: DistributedQueueBackendAccessor) {}

  public async start(options: QueueBackendOptions): Promise<void> {
    if (this.timer || this.workerId) {
      await this.shutdown();
    }
    this.workerId = await this.accessor.registerWorker();
    this.timer = setInterval(this.processQueue.bind(this), 1000);
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
    return undefined;
  }

  public async isScheduled(id: string): Promise<boolean> {
    return !!await this.accessor.getJob(id);
  }

  public async submit(job: Job<unknown>, options: QueueBackendScheduleOptions): Promise<string> {
    const jobId = await this.accessor.generateJobId();
    // await this.accessor.enqueueJob(this.workerId, {});
    return jobId;
  }

  private async processQueue(): Promise<void> {
    const maximumJobsToClaim = Math.max(0, this.maximumJobsToProcess - this.jobs.size);
    if (this.shouldClaimNewJobs() && this.workerId && maximumJobsToClaim > 0) {
      const potentialNewJobs = await this.accessor.claimOwnership(this.workerId,  maximumJobsToClaim);
      const newJobs = potentialNewJobs.filter((job) => !this.jobs.has(job.jobId));
      // Not awaiting promises from the forEach block as they need to run in parallel
      newJobs.forEach(this.startJobProcessing.bind(this));
    }
  }

  private async startJobProcessing(job: DistributedJob): Promise<void> {
    try {

      await this.jobCompleted(job);
    } catch (e) {
      await this.jobFailed(job);
    }
  }

  private async jobCompleted(job: DistributedJob): Promise<void> {
    if (this.workerId) {
      await this.accessor.completedOwnedJob(this.workerId, job.jobId);
    }
    this.jobs.delete(job.jobId);
  }

  private async jobFailed(job: DistributedJob): Promise<void> {
    /*
      Job failed:
      1. update job retry information
      2. if no more retries are allowed, mark job as an error
      3.
     */
  }

  private shouldClaimNewJobs(): boolean {
    return this.completedJobs >= 10 && this.jobs.size < 10;
  }
}

interface DistributedJob {
  queue: string;
  job: string;
  jobId: string;
  context: any;
  after: Date;
  updatedAt: Date;
}

export interface DistributedQueueBackendAccessor {
  /**
   * Register a new worker
   * @returns a worker id to be used with when workerId is needed
   */
  registerWorker(): Promise<string>;

  /**
   * Deregister a worker and possibly release all owned jobs
   * @param workerId worker id to deregister
   */
  deregisterWorker(workerId: string): Promise<void>;

  /**
   * Generate a new job id to be used with enqueue
   * @returns a job id
   */
  generateJobId(): Promise<string>;

  enqueueJob(workerId: string | null, job: DistributedJob): Promise<void>;

  ownedJobs(workerId: string, maximumJobs: number): Promise<DistributedJob[]>;

  /**
   * Fetch a job
   * @param jobId job's id to fetch
   * @returns the job information or null if not found
   */
  getJob(jobId: string): Promise<DistributedJob | null>;

  /**
   * Claim ownership of jobs that are ready to work on and not currently assigned to any worker or didn't have their ownership refreshed
   * @param workerId worker id to assign ownership to
   * @param maximumJobs maximum jobs to claim ownership
   * @returns list of claimed jobs. This method could return jobs that were already claimed before.
   */
  claimOwnership(workerId: string, maximumJobs: number): Promise<DistributedJob[]>;

  /**
   * Try to refresh ownership of jobs. Needs to be called periodically on jobs that take longer than
   * ownership expiration time to make sure that other workers won't take ownership of the job
   * @param workerId worker id to refresh ownership of
   * @param jobIds list of job ids to refresh ownership
   */
  refreshOwnership(workerId: string, jobIds: string[]): Promise<void>;

  /**
   * Mark a job completed. It will only complete the job if it is owned by the provided worker
   * @param workerId worker id that completed the job
   * @param jobId job id that has been completed
   */
  completedOwnedJob(workerId: string, jobId: string): Promise<void>;
}

interface DatabaseAccessor {
  execute(query: string, namedArgs: { [key: string]: any }): Promise<unknown>;
}

/**
 * Postgres distributed queue accessor implementation
 *
 */
class PostgresDistributedQueueBackendAccessor implements DistributedQueueBackendAccessor {
  constructor(private db: DatabaseAccessor, private tableBaseName: string) {}

  public async registerWorker(): Promise<string> {
    return uuid.v4();
  }

  public async generateJobId(): Promise<string> {
    return uuid.v4();
  }

  public async deregisterWorker(workerId: string): Promise<void> {
  }

  public async claimOwnership(workerId: string, maximumJobs: number): Promise<DistributedJob[]> {
    await this.db.execute(`
        UPDATE ${this.tableBaseName} SET worker_id=:workerId WHERE workerId IS NULL OR updatedAt >= NOW() - INTERVAL '20 seconds' RETURNING *
    `, {
      worker_id: workerId,
    });
    return [];
  }

  public async completedOwnedJob(workerId: string, jobId: string): Promise<void> {
  }

  public async getJob(jobId: string): Promise<DistributedJob | null> {
    return await this.db.execute(`SELECT * FROM ${this.tableBaseName} WHERE job_id=:jobId`, { jobId }) as DistributedJob;
  }

  public async enqueueJob(workerId: string | null, job: DistributedJob): Promise<void> {
    await this.db.execute(`INSERT INTO ${this.tableBaseName} VALUES()`, { workerId, job });
  }

  public async ownedJobs(workerId: string, maximumJobs: number): Promise<DistributedJob[]> {
    return [];
  }

  public async refreshOwnership(workerId: string, jobIds: string[]): Promise<void> {
    await this.db.execute(`
      UPDATE ${this.tableBaseName} SET updated_at=NOW() WHERE worker_id=:workerId AND job_id IN (:jobIds)
    `, { workerId, jobIds });
  }
}
