export class RelayError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'RelayError';
    this.code = code;
    this.status = status;
  }
}

export function demand(condition, code, message, status = 400) {
  if (!condition) throw new RelayError(code, message, status);
}
