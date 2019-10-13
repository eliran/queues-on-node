export class Registry<T> {
  private entries: { [name: string]: T } = {};

  public register(name: string, create: () => T): T | null {
    if (name in this.entries) { return null; }
    const entry = create();
    this.entries[name] = entry;
    return entry;
  }

  public allNames(): string[] {
    return Object.keys(this.entries);
  }

  public all(): { [name: string]: T } {
    return Object.freeze({ ...this.entries });
  }

  public get(name: string): T | null {
    return this.entries[name] || null;
  }
}
