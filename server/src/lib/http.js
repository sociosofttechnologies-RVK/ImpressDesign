export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Wraps async route handlers so thrown errors reach the error middleware.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const required = (obj, fields) => {
  const missing = fields.filter((f) => obj?.[f] === undefined || obj?.[f] === null || String(obj[f]).trim() === '');
  if (missing.length) throw new HttpError(400, `Missing: ${missing.join(', ')}`);
};
