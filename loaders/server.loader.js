'use strict';

const http = require('http');
const i18n = require('@config/i18n.config');

module.exports = function (app) {

  const port = app.get('port');
  const server = http.createServer(app);

  // Listen on provided port, on all network interfaces.
  server.listen(app.get('port'));

  // Event listener for HTTP server "error" event.
  server.on('error', error => {
    if (error.syscall !== 'listen') {
      throw error;
    }

    const bind = typeof port === 'string'
      ? `${i18n.__('Pipe')} ${port}`
      : `${i18n.__('Port')} ${port}`;

    // handle specific listen errors with friendly messages
    switch (error.code) {
      case 'EACCES':
        console.error(i18n.__('{{bind}} requires elevated privileges', { bind }));
        process.exit(1);
        break;
      case 'EADDRINUSE':
        console.error(i18n.__('{{bind}} is already in use', { bind }));
        process.exit(1);
        break;
      default:
        throw error;
    }
  });

  // Event listener for HTTP server "listening" event.
  server.on('listening', () => {
    const addr = server.address();
    const bind = typeof addr === 'string'
      ? `${i18n.__('Pipe').toLowerCase()} ${addr}`
      : `${i18n.__('Port').toLowerCase()} ${addr.port}`;
    console.log(i18n.__('Server listening on {{bind}}', { bind }));
  });

  return server;
};