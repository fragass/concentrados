const core = require('./_lib/core');
module.exports = (req, res) => core(req, res, 'profile-upload');
module.exports.config = core.config;
