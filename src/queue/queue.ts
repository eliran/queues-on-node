import { Job } from '@app/job/job';

export interface ScheduleOptions {
    job: Job<any>;
    after?: Date;
}

// QueuedJob -> Job, Schedule, Processing information

/*

  - JobFactory => Job (immutable attributes)
  - When scheduling the job on a queue it creates a QueuedJob
  - The queue job is the one scheduled in the queue and eventaully executes


  The queue can store a queuedJob and pull the next queue job to execute

  To execute the job, the JobFactory holds the handler and the JobFactory is registered with the registry

  QueueManager/Controller

     Has a job registry can make a job factories for usage. All jobs created by the factories can
      be scheduled in any queue the queue manager handles


    const manager = QueueManager();


    class MyQueues {
      constructor(private manager: QueueManager) {}

      const cron = this.manager.makeJobFactory('cron', ({ attributes }) => executeSomeThing)

      const sync = this.manager.makeJobFactory('sync', () => )
    }


   queues = MyQueues()

   queues.cron.make({ attributes })




  We want a simple API for users:

  A user should be able to register a job type and schedule it without worrying about queues
  It should have the option to assign a job to a certain queue but jobs should default to a specific queue

  The callers should use a single service to prepare everything although internally it could be split to different
  parts.


  interface QueueService {
     registerJob(options: RegisterJobOptions, jobHandler: JobHandler<Context>): JobManager<Context>
  }

  interface JobFactory<Context> {
     make(context: Context): Job
     schedule(options: ScheduleJobOptions, context: Context): QueuedJob
     later(context: Context): QueuedJob
  }

  interface Job {
    schedule(options: ScheduleJobOptions): QueuedJob
    later(): QueueJob
  }


 const makeSomethingJobs = service.registerJob()

 makeSomethingJobs.make({}).later()
 makeSomethingJobs.later({})

 */

export interface Queue {
    readonly name: string;
}

// export class Queue {
//     public static make(): Queue {
//         return new Queue();
//     }
//
//     private scheduled: ScheduleOptions[] = [];
//     private timer: Timeout | null;
//     private constructor() {
//         this.timer = setInterval(this.processQueue.bind(this), 1000);
//     }
//
//     public stop() {
//         if (this.timer !== null) {
//             clearInterval(this.timer);
//             this.timer = null;
//         }
//     }
//
//     public schedule(options: ScheduleOptions) {
//         if (options.after) {
//             this.scheduled.push(options);
//         } else {
//             this.executeJob(options.job);
//         }
//     }
//
//     public cancel(job: Job<any>) {
//         this.scheduled = this.scheduled.filter((options) => options.job !== job);
//     }
//
//     public isScheduled(job: Job): boolean {
//         for (const scheduledJob of this.scheduled) {
//             if (scheduledJob.job === job) {
//                 return true;
//             }
//         }
//         return false;
//     }
//
//     private executeJob(job: Job<any>) {
//         job.execute().then(() => {}, () => {});
//     }
//
//     private processQueue() {
//         const now = new Date().getTime();
//         for (let i = this.scheduled.length - 1; i >= 0; i--) {
//             const options = this.scheduled[i];
//             if (!options.after || (now >= options.after.getTime())) {
//                 this.scheduled.splice(i, 1);
//                 this.executeJob(options.job);
//             }
//         }
//     }
// }
