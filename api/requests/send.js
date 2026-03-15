const core = require('../_lib/core');
module.exports = (req, res) => core(req, res, 'requests/send');
module.exports.config = core.config;
