export class QueueAlreadyRegisteredError extends Error {
  constructor(queueName: string) {
    super(`Queue '${queueName}' already registered`);
  }
}

export class QueueNotRegisteredError extends Error {
  constructor(queueName: string) {
    super(`Queue '${queueName}' not registered`);
  }
}

export class UnknownJobError extends Error {
  constructor(jobName: string) {
    super(`Unknown job '${jobName}'`);
  }
}

export class JobAlreadyRegisteredError extends Error {
  constructor(jobName: string) {
    super(`Job ${jobName} already registered`);
  }
}
