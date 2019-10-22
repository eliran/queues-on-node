import { DistributedJob, DistributedJobStatus, DistributedQueueBackendAccessor } from '@backend/accessors/index';
import uuid = require('uuid');

export interface DatabaseAccessorResult {
  rowCount: number;
  rows: [unknown];
}

export interface DatabaseAccessor {
  execute(query: string, namedArgs: { [key: string]: any }): Promise<DatabaseAccessorResult>;
}

export interface DBPostgresJob {
  job_id: string;
  queue_name: string;
  job_name: string;
  group_key: string | null;
  job_context: any;
  run_after: Date | null;
  worker_id: string | null;
  status: DistributedJobStatus;
  latest_error: any | null;
  retry_attempts: number;
  updated_at: Date;
  created_at: Date;
}

/**
 * Postgres distributed queue accessor implementation
 *
 */
export class PostgresDistributedQueueBackendAccessor implements DistributedQueueBackendAccessor {
  constructor(private db: DatabaseAccessor, private tableNamePrefix: string) {}

  public get tableName(): string {
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

  public async claimOwnership(workerId: string, maximumJobs: number, staleAfterSeconds?: number): Promise<DistributedJob[]> {
    const result = await this.db.execute(`
        UPDATE ${this.tableName} SET worker_id=:workerId, updated_at = NOW()
          WHERE job_id IN (
            SELECT job_id FROM ${this.tableName}
              WHERE (worker_id IS NULL OR updated_at <= NOW() - INTERVAL '30 seconds')
              AND (run_after IS NULL OR run_after <= NOW())
              FOR UPDATE SKIP LOCKED
              LIMIT :maximumJobs
        ) RETURNING *
    `, {
      workerId,
      staleInterval: `${staleAfterSeconds || 30} seconds`,
      maximumJobs,
    });
    return (result.rows as DBPostgresJob[]).map((row) => ({
      jobId: row.job_id,
      queueName: row.queue_name,
      jobName: row.job_name,
      groupKey: row.group_key,
      jobContext: row.job_context,
      runAfter: row.run_after,
      workerId: row.worker_id,
      status: row.status,
      latestError: row.latest_error,
      retryAttempts: row.retry_attempts,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    } as DistributedJob));
  }

  public async backoffOwnedJob(workerId: string, jobId: string, retryAttempt: number, backoffTimeOffsetInSeconds: number): Promise<void> {
    await this.db.execute(`
      UPDATE ${this.tableName}
        SET worker_id=NULL, status='scheduled', retry_attempts=:retryAttempt, run_after=NOW() + INTERVAL '${backoffTimeOffsetInSeconds} seconds'
        WHERE worker_id=:workerId AND job_id=:jobId
    `, { workerId, jobId, retryAttempt });
  }

  public async deleteJob(workerId: string | null, jobId: string): Promise<void> {
    await this.db.execute(`
      DELETE FROM ${this.tableName} WHERE ${workerId ? 'worker_id=:workerId' : 'worker_id IS NULL'} AND job_id=:jobId
    `, { workerId, jobId });
  }

  public async errorOwnedJob<Reason extends {}>(workerId: string, jobId: string, reason: Reason): Promise<void> {
    await this.db.execute(`
      UPDATE ${this.tableName}
        SET worker_id=NULL, status='errored', run_after=NULL, latest_error=:reason
        WHERE worker_id=:workerId AND job_id=:jobId
    `, { workerId, jobId, reason });
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
