export class QueueAlreadyExists extends Error {
  constructor(queueName: string) {
    super(`Queue '${queueName}' already exists`);
  }
}

export class QueueNotRegistered extends Error {
  constructor(queueName: string) {
    super(`Queue '${queueName}' not registered`);
  }
}

export class UnknownJobError extends Error {
  constructor(jobName: string) {
    super(`Unknown job '${jobName}'`);
  }
}
