import { DistributedJob, DistributedJobStatus, DistributedQueueBackendAccessor } from '@backend/accessors/index';
import uuid = require('uuid');

export interface DatabaseAccessor {
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

  public async backoffOwnedJob(workerId: string, jobId: string, retryAttempt: number, backoffTimeOffsetInSeconds: number): Promise<void> {
  }

  public async deleteJob(workerId: string | null, jobId: string): Promise<void> {
  }

  public async errorOwnedJob<Reason extends {}>(workerId: string, jobId: string, reason: Reason): Promise<void> {
  }

  public async getJobStatus(jobId: string): Promise<DistributedJobStatus | 'not-supported' | null> {
    return 'not-supported';
  }

  public async retryErroredJob(jobId: string): Promise<void> {
  }

  public async enqueueJob(workerId: string | null, job: DistributedJob): Promise<void> {
    await this.db.execute(`INSERT INTO ${this.tableBaseName} VALUES()`, { workerId, job });
  }

  public async refreshOwnership(workerId: string, jobIds: string[]): Promise<void> {
    await this.db.execute(`
      UPDATE ${this.tableBaseName} SET updated_at=NOW() WHERE worker_id=:workerId AND job_id IN (:jobIds)
    `, { workerId, jobIds });
  }
}
