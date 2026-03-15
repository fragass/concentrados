const core = require('./_lib/core');
module.exports = (req, res) => core(req, res, 'messages');
module.exports.config = core.config;
