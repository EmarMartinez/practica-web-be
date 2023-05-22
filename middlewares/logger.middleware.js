'use strict';

const logger = require('morgan');
const { format } = require('date-fns');

logger.token('timestamp', function () { return `[${format(new Date(), 'dd/MM/yy HH:mm:ss.SSS')}]`; });
logger.token('color', (req, res) => {
  // get the status code if response written
  const status = (typeof res.headersSent !== 'boolean' ? Boolean(res.header) : res.headersSent)
    ? res.statusCode
    : undefined;

  // get status color
  const color = status >= 500 ? 31 // red
    : status >= 400 ? 33 // yellow
      : status >= 300 ? 36 // cyan
        : status >= 200 ? 32 // green
          : 0; // no color

  return `\x1b[${color}m`;
});

module.exports = logger(':color:timestamp [RES] :method :url :status :response-time ms - :res[content-length]\x1b[0m');
