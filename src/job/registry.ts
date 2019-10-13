import { JobManager } from '@app/job/manager';
import {JobFactory} from './factory';

export class JobAlreadyRegisteredError extends Error {
    constructor(jobName: string) {
        super(`Job ${jobName} already registered`);
    }
}

// export class JobRegistry {
//     private factories = new Map<string, JobFactory<any>>();
//
//     public make<Context>(name: string, handler: (context: Context) => Promise<void>): JobManager<Context> {
//         if (this.factories.has(name)) {
//             throw new JobAlreadyRegisteredError(name);
//         }
//         const manager: JobManager = {
//
//         }
//         const factory = new JobFactory(name, handler);
//         this.factories.set(name, factory);
//         return factory;
//     }
//
//     get allRegisteredJobFactories(): string[] {
//         return [ ...this.factories.keys() ];
//     }
// }
