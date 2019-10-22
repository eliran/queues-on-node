export interface Job<Context> {
    readonly id: string;
    readonly name: string;
    readonly context: Context;
}
