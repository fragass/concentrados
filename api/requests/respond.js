const core = require('../_lib/core');
module.exports = (req, res) => core(req, res, 'requests/respond');
module.exports.config = core.config;
