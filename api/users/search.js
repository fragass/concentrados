const core = require('../_lib/core');
module.exports = (req, res) => core(req, res, 'users/search');
module.exports.config = core.config;
