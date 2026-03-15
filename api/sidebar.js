const core = require('./_lib/core');
module.exports = (req, res) => core(req, res, 'sidebar');
module.exports.config = core.config;
