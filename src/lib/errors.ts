export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export interface ValidationDetail {
  field: string;
  message: string;
}

export class ValidationError extends AppError {
  public readonly details: ValidationDetail[];

  constructor(details: ValidationDetail[], message = 'Validation failed') {
    super(message, 422, 'VALIDATION_ERROR');
    this.details = details;
  }
}
