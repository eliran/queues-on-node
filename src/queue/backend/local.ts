import { Job } from '@lib/job';
import { QueueBackend, QueueBackendOptions, QueueBackendScheduleOptions } from '@lib/queue';
import uuid from 'uuid';
import Timeout = NodeJS.Timeout;

interface ScheduledJob {
  id: string;
  job: Job<unknown>;
  after?: Date;
}

export class Local implements QueueBackend {
  private timer: Timeout | null = null;
  private scheduledJobs: ScheduledJob[] = [];
  private executeHandler: ((job: Job<unknown>) => Promise<void>) | null = null;

  constructor(private rateInMs: number = 1000) {
  }

  public async start(options: QueueBackendOptions): Promise<void> {
    if (this.timer) {
      await this.shutdown();
    }
    this.executeHandler = options.executeHandler;
    this.timer = setInterval(this.processQueue.bind(this), this.rateInMs);
  }

  public async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.executeHandler = null;
    }
  }

  public async submit(job: Job<unknown>, options: QueueBackendScheduleOptions): Promise<string> {
    const id = uuid.v4();
    this.scheduledJobs.push({ id, job, after: options.after });
    return id;
  }

  public async isScheduled(id: string): Promise<boolean> {
    return !!await this.scheduledJobs.find((scheduledJob) => scheduledJob.id === id);
  }

  public async cancel(id: string): Promise<void> {
    this.scheduledJobs = this.scheduledJobs.filter((scheduledJob) => scheduledJob.id !== id);
  }

  private async processQueue() {
    const now = new Date().getTime();
    for (let i = this.scheduledJobs.length - 1; i >= 0; i--) {
      const options = this.scheduledJobs[i];
      if (!options.after || (now >= options.after.getTime())) {
        this.scheduledJobs.splice(i, 1);
        if (this.executeHandler) {
          await this.executeHandler(options.job);
        }
      }
    }
  }
}
