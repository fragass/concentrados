const core = require('../_lib/core');
module.exports = (req, res) => core(req, res, 'groups/create');
module.exports.config = core.config;
