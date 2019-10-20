import { DistributedJob, DistributedJobStatus, DistributedQueueBackendAccessor } from '@backend/accessors/index';
import uuid = require('uuid');

export interface DatabaseAccessor {
  execute(query: string, namedArgs: { [key: string]: any }): Promise<unknown>;
}

/**
 * Postgres distributed queue accessor implementation
 *
 */
export class PostgresDistributedQueueBackendAccessor implements DistributedQueueBackendAccessor {
  constructor(private db: DatabaseAccessor, private tableNamePrefix: string) {}

  private get tableName(): string {
    return `${this.tableNamePrefix}jobs`;
  }

  public static async migrations(tableNamePrefix: string): Promise<string[]> {
    return [
      `CREATE TYPE ${tableNamePrefix}job_status AS ENUM ('scheduled', 'processing', 'errored');`,
      `CREATE TABLE ${tableNamePrefix}jobs (
        job_id         UUID PRIMARY KEY,
        queue_name     VARCHAR NOT NULL,
        job_name       VARCHAR NOT NULL,
        group_key      VARCHAR,
        job_context    JSONB NOT NULL,
        run_after      TIMESTAMP WITH TIME ZONE,
        worker_id      UUID,
        status         ${tableNamePrefix}job_status NOT NULL,
        latest_error   JSONB,
        retry_attempts INT NOT NULL DEFAULT 0,
        updated_at     TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
       )`,
    ];
  }

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
        UPDATE ${this.tableName} SET worker_id=:workerId WHERE workerId IS NULL OR updatedAt >= NOW() - INTERVAL '20 seconds' RETURNING *
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
    await this.db.execute(`
        INSERT INTO ${this.tableName} (worker_id, job_id, queue_name, job_name, group_key, run_after, status, updated_at, job_context)
        VALUES(:workerId, :jobId, :queueName, :jobName, :groupKey, :runAfter, :status, NOW(), :jobContext)
    `, {
      ...job,
      workerId,
    });
  }

  public async refreshOwnership(workerId: string, jobIds: string[]): Promise<void> {
    await this.db.execute(`
      UPDATE ${this.tableName} SET updated_at=NOW() WHERE worker_id=:workerId AND job_id IN (:jobIds)
    `, { workerId, jobIds });
  }
}
