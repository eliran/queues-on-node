import { DatabaseAccessor, DBPostgresJob, PostgresDistributedQueueBackendAccessor } from '@backend/accessors/postgres';
import { distributedJobFactory, expect } from '@test';
import { pg } from '@testSupport/postgres';
import { DistributedJob, DistributedJobStatus } from 'src/queue/backend/accessors/index';
import uuid = require('uuid');

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

  describe('without a worker id', function() {
    it('should insert new elements to table', async function() {
      const job = distributedJobFactory.build();
      await sut.enqueueJob(null, job);

      const result = await fetchJob(job.jobId);

      expect(result).to.eql(removeFields({ ...job, workerId: null }));
    });

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

      expect(result).to.eql(removeFields({ ...job, workerId }));
    });
  });

  describe('#claimOwnership', function() {
    const workerId = uuid.v4();

    it('should claim ownership of unassigned jobs that needs to run', async function() {
      const unassignedJobs = await enqueueSampleJobs(2);
      const assignedJobs = await enqueueSampleJobs(1, { workerId: uuid.v4() });
      const futureJobs = await enqueueSampleJobs(1, { runAfter: nowPlusSeconds(60) });

      const claimedJobs = await sut.claimOwnership(workerId, 10);

      const updatedUnassignedJobs = await Promise.all(unassignedJobs.map(async (job) => fetchJob(job.jobId)));
      const updatedAssignedJobs = await Promise.all(assignedJobs.map(async (job) => fetchJob(job.jobId)));
      const updatedFutureJobs = await Promise.all(futureJobs.map(async (job) => fetchJob(job.jobId)));

      expect(claimedJobs.length).to.equal(unassignedJobs.length);
      expect(futureJobs).to.eql(updatedFutureJobs);
      expect(assignedJobs).to.eql(updatedAssignedJobs);
      expect(unassignedJobs.map((job) => ({ ...job, workerId }))).to.eql(updatedUnassignedJobs);
    });

    it('should claim assigned jobs that have expired', async function() {
      const expiredJobs = await enqueueSampleJobs(2, { workerId: uuid.v4(), updatedAt: nowPlusSeconds(-60) });

      const claimedJobs = await sut.claimOwnership(workerId, 10);

      const updatedExpiredJobs = await Promise.all(expiredJobs.map(async (job) => fetchJob(job.jobId)));
      expect(claimedJobs.length).to.equal(expiredJobs.length);
      expect(claimedJobs.map(removeFields)).to.eql(updatedExpiredJobs);
    });

    it('should limit the amount of jobs claimed', async function() {
      const unassignedJobs = await enqueueSampleJobs(10);

      const claimedJobs = await sut.claimOwnership(workerId, 5);

      const updatedUnassignedJobs = await Promise.all(unassignedJobs.map(async (job) => fetchJob(job.jobId)));
      const claimedUnassignedJobs = updatedUnassignedJobs.filter((job) => job && job.workerId === workerId);

      expect(claimedJobs.length).to.equal(5);
      expect(claimedUnassignedJobs.length).to.equal(5);
      expect(claimedUnassignedJobs).to.eql(claimedJobs.map(removeFields));
    });

    it('should skip locked rows when claiming jobs', async function() {
      const unassignedJobs = await enqueueSampleJobs(10);

      // Doing a select for update in a transaction for some job ids which should lock them until the transaction finishes
      const trx = await pg.transaction();
      await trx(sut.tableName)
        .select()
        .whereIn('job_id', [unassignedJobs[0].jobId, unassignedJobs[2].jobId, unassignedJobs[5].jobId])
        .forUpdate();

      const claimedJobs = await sut.claimOwnership(workerId, 10);

      // Finishing the transaction to unlock the rows
      await trx.rollback();

      expect(claimedJobs.length).to.equal(7);
      expect(claimedJobs.map((job) => job.jobId)).to.eql(unassignedJobs.filter((_, index) => [0, 2, 5].indexOf(index) === -1).map((job) => job.jobId));
    });

    it('should update the updatedAt time', async function() {
        const expiredJob = (await enqueueSampleJobs(1, { updatedAt: nowPlusSeconds(-60) }))[0];
        const previousUpdatedAt = (await fetchJob(expiredJob.jobId, false))!.updatedAt;

        await sut.claimOwnership(workerId, 1);

        const currentUpdatedAt = (await fetchJob(expiredJob.jobId, false))!.updatedAt;

        expect(currentUpdatedAt).to.be.greaterThan(previousUpdatedAt);
        expect(currentUpdatedAt.getTime() - previousUpdatedAt.getTime()).to.be.greaterThan(59);
    });

    async function enqueueSampleJobs(count: number, options: { workerId?: string, runAfter?: Date, updatedAt?: Date } = {}): Promise<DistributedJob[]> {
      const jobs: DistributedJob[] = [];
      for (let i = 0; i < count; i++) {
        const sampleJob = distributedJobFactory.build({ workerId: options.workerId || null, runAfter: options.runAfter || null });
        await sut.enqueueJob(sampleJob.workerId, sampleJob);
        if (options.updatedAt) {
          await pg(sut.tableName).update({ updated_at: options.updatedAt }).where('job_id', sampleJob.jobId);
        }
        jobs.push(removeFields(sampleJob));
      }
      return jobs;
    }

    function nowPlusSeconds(seconds: number): Date {
      const now = new Date();
      now.setTime(now.getTime() + seconds * 1000);
      return now;
    }
  });

  describe('#deleteJob', function() {
    const job = distributedJobFactory.build();

    // Validating that delete only operates on the targeted job and doesn't delete other jobs
    const validatingJobWithNoWorkerId = distributedJobFactory.build({ workerId: null });
    const validatingJobWithWorkerId = distributedJobFactory.build({ workerId: uuid.v4() });

    beforeEach(async function() {
      await sut.enqueueJob(null, validatingJobWithNoWorkerId);
      await sut.enqueueJob(validatingJobWithWorkerId.workerId, validatingJobWithWorkerId);
    });

    afterEach(async function() {
      expect(await fetchJob(validatingJobWithWorkerId.jobId)).to.not.be.null;
      expect(await fetchJob(validatingJobWithNoWorkerId.jobId)).to.not.be.null;
    });

    it('should delete a job if worker id for that job is null', async function() {
      await sut.enqueueJob(null, job);

      await sut.deleteJob(null, job.jobId);

      expect(await fetchJob(job.jobId)).to.be.null;
    });

    it('should not delete a job if worker id is not matching', async function() {
      await sut.enqueueJob(uuid.v4(), job);

      await sut.deleteJob(null, job.jobId);

      expect(await fetchJob(job.jobId)).to.not.be.null;
    });

    it('should not delete a job if job id is not matching and worker id is null', async function() {
        await sut.enqueueJob(null, job);

        await sut.deleteJob(null, uuid.v4());

        expect(await fetchJob(job.jobId)).to.not.be.null;
    });

    it('should not delete a job if job id is not matching and worker id is matching', async function() {
      await sut.enqueueJob(validatingJobWithWorkerId.workerId, job);

      await sut.deleteJob(validatingJobWithWorkerId.workerId, uuid.v4());

      expect(await fetchJob(job.jobId)).to.not.be.null;
    });
  });

  function removeFields(value: any): any {
    delete value.createdAt;
    delete value.updatedAt;
    return value;
  }

  async function fetchJob(jobId: string, remove: boolean = true): Promise<DistributedJob | null> {
    const job = await pg(testTableName)
      .select(['worker_id', 'job_id', 'queue_name', 'job_name', 'group_key', 'status', 'run_after', 'latest_error', 'retry_attempts', 'job_context', 'updated_at', 'created_at'])
      .where('job_id', jobId)
      .first<DBPostgresJob>();
    if (!job) { return null; }
    const distributedJob: DistributedJob = {
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
    return remove ? removeFields(distributedJob) : distributedJob;
  }

});
