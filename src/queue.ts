import {Job} from '@app/job/job';
import Timeout = NodeJS.Timeout;

export interface ScheduleOptions {
    job: Job<any>;
    after?: Date;
}

export class Queue {
    public static make(): Queue {
        return new Queue();
    }

    private scheduled: ScheduleOptions[] = [];
    private timer: Timeout | null;
    private constructor() {
        this.timer = setInterval(this.processQueue.bind(this), 1000);
    }

    public stop() {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    public schedule(options: ScheduleOptions) {
        if (options.after) {
            this.scheduled.push(options);
        } else {
            this.executeJob(options.job);
        }
    }

    public cancel(job: Job<any>) {
        this.scheduled = this.scheduled.filter((options) => options.job !== job);
    }

    public isScheduled(job: Job): boolean {
        for (const scheduledJob of this.scheduled) {
            if (scheduledJob.job === job) {
                return true;
            }
        }
        return false;
    }

    private executeJob(job: Job<any>) {
        job.execute().then(() => {}, () => {});
    }

    private processQueue() {
        const now = new Date().getTime();
        for (let i = this.scheduled.length - 1; i >= 0; i--) {
            const options = this.scheduled[i];
            if (!options.after || (now >= options.after.getTime())) {
                this.scheduled.splice(i, 1);
                this.executeJob(options.job);
            }
        }
    }
}
