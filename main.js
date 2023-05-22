'use strict';

// Set require paths aliases (routes starting with @)
require('module-alias/register');

// Add timestamp prefix and colors to console messages
require('@loaders/console.loader');

// Async immediately invoked function expression (IIFE) to start server after a successful DB connection
(async () => {

  // Mount app middlewares and routers
  // Models are also loaded in the process to be ready for DB connection.
  const app = require('@loaders/app.loader');

  // Connect to database
  await require('@loaders/sequelize.loader')();

  // Start server
  const server = require('@loaders/server.loader')(app);

  // Start Socket.IO, if enabled
  const { isSocketIoEnabled } = require('@config');
  if (isSocketIoEnabled) require('@loaders/socket-io.loader').startSocketIo(server);
})();
