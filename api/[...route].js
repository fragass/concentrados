const core = require('./_lib/core');
module.exports = (req, res) => core(req, res);
module.exports.config = core.config;
