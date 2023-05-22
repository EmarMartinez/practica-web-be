'use strict';

const express = require('express');
const { isMultitenantEnabled, isMultitenantSeparate } = require('@config');

module.exports = function (routerConfig) {

  const router = express.Router();

  const { middlewares, controllers, routers } = routerConfig;

  if (middlewares) middlewares
    .forEach(middleware => router.use(middleware));
  if (controllers) controllers
    .forEach(controller => {
      const tenantPath = (
        isMultitenantEnabled &&
        isMultitenantSeparate &&
        controller.service.getTenant() !== 'admin') ? `/${controller.service.getTenant()}` : '';
      router.use(`${tenantPath}${controller.path}`, controller.router);
    });
  if (routers) routers
    .forEach(routerConfig => router.use(routerConfig.path, routerConfig.router));

  return router;
};
