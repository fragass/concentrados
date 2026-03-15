const core = require('../_lib/core');
module.exports = (req, res) => core(req, res, 'groups/remove-member');
module.exports.config = core.config;
