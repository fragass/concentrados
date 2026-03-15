const core = require('../_lib/core');
module.exports = (req, res) => core(req, res, 'presence/ping');
module.exports.config = core.config;
