export enum DistributedJobStatus {
  SCHEDULED = 'scheduled',
  PROCESSING = 'processing',
  ERRORED = 'errored',
}

export interface WritableDistributedJob {
  queueName: string;

  jobId: string;
  jobName: string;
  jobContext: any;

  groupKey: string | null;
  runAfter: Date | null;
}

export interface DistributedJob extends WritableDistributedJob {
  workerId: string | null;
  status: DistributedJobStatus;
  retryAttempts: number;
  latestError: any;
  updatedAt: Date;
  createdAt: Date;
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

  getJobStatus(jobId: string): Promise<DistributedJobStatus | 'not-supported' | null>;

  /**
   * Enqueue a new job in the queue
   * @param workerId worker id to potentially assign this job to
   * @param job job parameters
   */
  enqueueJob(workerId: string | null, job: WritableDistributedJob): Promise<void>;

  /**
   * Claim ownership of jobs that are ready to work on and not currently assigned to any worker or didn't have their ownership refreshed
   * @param workerId worker id to assign ownership to
   * @param maximumJobs maximum jobs to claim ownership
   * @param staleAfterSeconds optional how many seconds from last update to a job it is assumed stale
   * @returns list of claimed jobs. This method could return jobs that were already claimed before.
   */
   claimOwnership(workerId: string, maximumJobs: number, staleAfterSeconds?: number): Promise<DistributedJob[]>;

  /**
   * Try to refresh ownership of jobs. Needs to be called periodically on jobs that take longer than
   * ownership expiration time to make sure that other workers won't take ownership of the job
   * @param workerId worker id to refresh ownership of
   * @param jobIds list of job ids to refresh ownership
   */
  refreshOwnership(workerId: string, jobIds: string[]): Promise<void>;

  /**
   * Delete a job with a matching job id and worker id
   * @param workerId worker id owning the job or null for unowned jobs
   * @param jobId job id that has been completed
   */
  deleteJob(workerId: string | null, jobId: string): Promise<void>;

  /**
   * Reschedule the job due to a backoff requirements (ie. excessive errors)
   * @param workerId worker id owning this job
   * @param jobId job id to backoff
   * @param retryAttempt the current retry attempt
   * @param backoffTimeOffsetInSeconds how many seconds from now to reschedule the job
   */
  backoffOwnedJob(workerId: string, jobId: string, retryAttempt: number, backoffTimeOffsetInSeconds: number): Promise<void>;

  /**
   * Mark a job as errored and provide a reason object to log with it
   * @param workerId worker id owning this job
   * @param jobId job id to error. Job must be in processing state
   * @param reason a reason object to store as json
   */
  errorOwnedJob<Reason extends {}>(workerId: string, jobId: string, reason: Reason): Promise<void>;

  /**
   * Retry an errored job. The job retry count will reset
   * @param jobId job id to retry. The job must be in error state
   */
  retryErroredJob(jobId: string): Promise<void>;

}
