const userRepo = require('../repos/userRepo');
const { ConflictError, NotFoundError } = require('../errors');

module.exports = {
  async listAll() { return userRepo.listAll(); },
  async listFaculty() { return userRepo.listByRole('faculty'); },
  async listTechnicians() { return userRepo.listByRole('technician'); },
  async findById(id) { return userRepo.findById(id); },
  async findByEmail(email) { return userRepo.findByEmail(email); },

  async preRegister({ email, name, role }) {
    if (await userRepo.findByEmail(email)) throw new ConflictError('A user with that email already exists');
    return userRepo.create({ email, name, role });
  },

  async updateProfile(id, patch) {
    if (!(await userRepo.findById(id))) throw new NotFoundError('User');
    return userRepo.update(id, patch);
  },

  async completeFirstSignup({ email, name, phone, role = 'student', department = null }) {
    const existing = await userRepo.findByEmail(email);
    if (existing) return existing;
    return userRepo.create({ email, name, phone, role, department });
  },
};
