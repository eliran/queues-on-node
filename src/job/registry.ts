import {JobFactory} from './factory';

export class JobAlreadyRegisteredError extends Error {
    constructor(jobName: string) {
        super(`Job ${jobName} already registered`);
    }
}

export class JobRegistry {
    private factories = new Map<string, JobFactory<any>>();

    public make<Context>(name: string, handler: (context: Context) => Promise<void>): JobFactory<Context> {
        if (this.factories.has(name)) {
            throw new JobAlreadyRegisteredError(name);
        }
        const factory = new JobFactory(name, handler);
        this.factories.set(name, factory);
        return factory;
    }

    get allRegisteredJobFactories(): string[] {
        return Array.from(this.factories.keys());
    }
}
