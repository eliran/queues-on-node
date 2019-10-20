import { DatabaseAccessor, PostgresDistributedQueueBackendAccessor } from '@backend/accessors/postgres';
import { distributedJobFactory, expect } from '@test';
import { pg } from '@testSupport/postgres';
import { DistributedJob, DistributedJobStatus } from 'src/queue/backend/accessors/index';
import uuid = require('uuid');

interface Job {
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

describe('Postgres queue backend', function() {
  const testTableNamePrefix = 'integration_';
  const testTableName = `${testTableNamePrefix}jobs`;
  let databaseAccessor!: DatabaseAccessor;
  let sut!: PostgresDistributedQueueBackendAccessor;

  beforeEach(async function() {
    const migrations = await PostgresDistributedQueueBackendAccessor.migrations(testTableNamePrefix);
    for (const migration of migrations) {
      await pg.raw(migration);
    }

    databaseAccessor = {
      execute: async (query: string, namedArgs: { [p: string]: any }) => pg.raw(query, namedArgs),
    };
    sut = new PostgresDistributedQueueBackendAccessor(databaseAccessor, testTableNamePrefix);
  });

  it('should insert new elements to table', async function() {
    const job = distributedJobFactory.build();
    await sut.enqueueJob(null, job);

    const result = await fetchJob(job.jobId);

    expect(result).to.eql({ ...job, workerId: null, updatedAt: result && result.updatedAt, createdAt: result && result.createdAt });
  });

  describe('with worker id', function() {
    let workerId!: string;

    beforeEach(async function() {
      workerId = await sut.registerWorker();
    });

    it('should insert new elements to table with a specific worker', async function() {
      const job = distributedJobFactory.build();
      await sut.enqueueJob(workerId, job);

      const result = await fetchJob(job.jobId);

      expect(result).to.eql({ ...job, workerId, updatedAt: result && result.updatedAt, createdAt: result && result.createdAt });
    });
  });

  async function fetchJob(jobId: string): Promise<DistributedJob | null> {
    const job = await pg(testTableName)
      .select(['worker_id', 'job_id', 'queue_name', 'job_name', 'group_key', 'status', 'run_after', 'latest_error', 'retry_attempts', 'job_context', 'updated_at', 'created_at'])
      .where('job_id', jobId)
      .first<Job>();
    if (!job) { return null; }
    return {
      workerId: job.worker_id,
      jobId: job.job_id,
      queueName: job.queue_name,
      jobName: job.job_name,
      groupKey: job.group_key,
      status: job.status,
      runAfter: job.run_after,
      latestError: job.latest_error,
      retryAttempts: job.retry_attempts,
      jobContext: job.job_context,
      updatedAt: job.updated_at,
      createdAt: job.created_at,
    };
  }

});
