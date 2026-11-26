export class WorkerEntrypoint {
  protected ctx: unknown;
  protected env: unknown;
  constructor(ctx: unknown, env: unknown) {
    this.ctx = ctx;
    this.env = env;
  }
}
