export interface Dependency {
  message(): string;
}

export const helloDependency: Dependency = {
  message(): string {
    return 'Hello World';
  },
};

export function hello() {
  return helloDependency.message();
}
