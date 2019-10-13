import {Job} from './job';
import uuid from 'uuid';

// Alternative names: JobHandler, JobManager, Job (changing current Job to be JobContext/JobParameters)
//  JobEntity<Context> Making Job
export class JobFactory<Context> {
    private makeJobId = () => uuid.v4();

    constructor(public readonly name: string, private handler: (context: Context) => Promise<void>) {}

    public make(context: Context): Job<Context> {
        return Object.freeze({ id: this.makeJobId(), name: this.name, context });
    }
}
