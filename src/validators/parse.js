const { ValidationError } = require('../errors');

function parseOrThrow(schema, input) {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const fields = {};
  for (const issue of r.error.issues) {
    const path = issue.path.join('.') || '_';
    fields[path] = issue.message;
  }
  const first = r.error.issues[0]?.message || 'Invalid input';
  throw new ValidationError(first, fields);
}

module.exports = { parseOrThrow };
