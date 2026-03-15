const core = require('./_lib/core');
module.exports = (req, res) => core(req, res, 'login');
module.exports.config = core.config;
