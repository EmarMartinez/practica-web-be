'use strict';

const createRouter = require('@factories/router.factory');
const { isMultitenantEnabled, adminFolder } = require('@config');

// Controllers
// Import tenants controller only if multitenant is enabled
const tenantsController = isMultitenantEnabled ? require(`.${adminFolder}/tenants/tenants.controller`) : undefined;
const usersController = require(`.${adminFolder}/users/users.controller`);

const routerConfig = {
  // middlewares: [ fooMiddleware, bazMiddleware ],
  controllers: [
    usersController,
  ],
  // routers: [{ path: '/foo', router: fooRouter }],
};

// Register tenants controller in first position, if multitenant enabled
if (isMultitenantEnabled) routerConfig.controllers.unshift(tenantsController);

const router = createRouter(routerConfig);

module.exports = router;
