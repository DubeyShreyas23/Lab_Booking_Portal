const settingsRepo = require('../repos/settingsRepo');

// Cached app/site name so we don't hit the DB on every request. Refreshed on
// boot and whenever an admin saves Settings.
let cache = { name: 'BEST Lab' };

async function refresh() {
  try {
    let v = await settingsRepo.get('lab_name');
    // Heal the pre-rebrand default so the site name never reverts to the old one.
    if (!v || !v.trim() || v.trim() === 'Central Analytical Laboratory') {
      v = 'BEST Lab';
      await settingsRepo.set('lab_name', v);
    }
    cache.name = v.trim();
  } catch (_) { /* keep last known name */ }
  return cache.name;
}

function getName() {
  return cache.name;
}

module.exports = { refresh, getName };
