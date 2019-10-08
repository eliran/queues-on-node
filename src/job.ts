export class Job {
    public static make(): Job {
        return new Job();
    }

    private executed = false;
    private constructor() {}

    get isExecuted(): boolean {
        return this.executed;
    }

    public async execute(): Promise<void> {
        this.executed = true;
    }
}
