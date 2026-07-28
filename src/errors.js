class AppError extends Error {
  constructor(message, status = 500, code = 'INTERNAL') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class ValidationError extends AppError {
  constructor(message, fields = {}) {
    super(message, 400, 'VALIDATION');
    this.fields = fields;
  }
}

class AuthError extends AppError {
  constructor(message = 'Authentication required') { super(message, 401, 'AUTH'); }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') { super(message, 403, 'FORBIDDEN'); }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') { super(`${resource} not found`, 404, 'NOT_FOUND'); }
}

class ConflictError extends AppError {
  constructor(message) { super(message, 409, 'CONFLICT'); }
}

module.exports = { AppError, ValidationError, AuthError, ForbiddenError, NotFoundError, ConflictError };
