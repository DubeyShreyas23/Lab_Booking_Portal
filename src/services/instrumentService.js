const instrumentRepo = require('../repos/instrumentRepo');
const { NotFoundError, ConflictError } = require('../errors');

function buildPayload(input) {
  return {
    code: input.code,
    name: input.name,
    description: input.description || null,
    location: input.location || null,
    experiment_minutes: input.experiment_minutes,
    maintenance_minutes: input.maintenance_minutes,
    open_hour: input.open_hour,
    close_hour: input.close_hour,
    technician_id: input.technician_id ? Number(input.technician_id) : null,
    active: input.active ? 1 : 0,
  };
}

module.exports = {
  async list() { return instrumentRepo.listAll(); },
  async listActive() { return instrumentRepo.listActive(); },
  async findActive(id) {
    const inst = await instrumentRepo.findActiveById(id);
    if (!inst) throw new NotFoundError('Instrument');
    return inst;
  },
  async upsert(input) {
    const payload = buildPayload(input);
    if (!payload.code || !payload.name) throw new ConflictError('Code and name are required');
    if (input.id) return instrumentRepo.update(Number(input.id), payload);
    return instrumentRepo.create(payload);
  },
  async deactivate(id) { return instrumentRepo.deactivate(id); },
};
