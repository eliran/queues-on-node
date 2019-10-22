import { each } from 'factory.ts';
import { DistributedJob, DistributedJobStatus } from 'src/queue/backend/accessors';
import { MockFactory } from 'src/testSupport/index';
import casual = require('casual');

export const distributedJobFactory = MockFactory.makeFactory<DistributedJob>({
  workerId: 'worker-1',
  jobId: each(() => casual.uuid),
  jobName: 'job',
  jobContext: {},
  queueName: 'queue',
  groupKey: null,

  latestError: null,
  retryAttempts: 0,
  status: DistributedJobStatus.SCHEDULED,
  runAfter: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
});
