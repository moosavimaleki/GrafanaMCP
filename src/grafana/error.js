export class GrafanaError extends Error {
  constructor(message, status = undefined) {
    super(message);
    this.name = 'GrafanaError';
    this.status = status;
  }
}
