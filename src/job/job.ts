export interface Job<Context> {
    readonly name: string;
    readonly id: string;
    readonly context: Context;
}
