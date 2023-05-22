'use strict';

const createApp = require('@factories/app.factory');
const { expressPort } = require('@config');

// Middlewares
const logReqMiddleware = require('@middlewares/log-req.middleware');
const jwtMiddleware = require('@middlewares/jwt.middleware');
const loggerMiddleware = require('@middlewares/logger.middleware');

// Routers
const apiRouter = require('@api/api.router');

const appConfig = {
  port: expressPort,
  middlewares: [
    logReqMiddleware,
    loggerMiddleware,
    jwtMiddleware
  ],
  routers: [
    { path: '/api', router: apiRouter }
  ]
};

const app = createApp(appConfig);

module.exports = app;
