'use strict';

const httpErrors = require('@shared/services/http-errors.service');
const jwt = require('@shared/services/jwt.service');
const i18n = require('@config/i18n.config');
const { adminFolder, isApiSecured, isMultitenantEnabled, isMultitenantCrossed } = require('@config');
const usersService = require(`@api${adminFolder}/users/users.service`);
// Import tenants service only if multitenant is enabled
const tenantsService = isMultitenantEnabled ? require(`@api${adminFolder}/tenants/tenants.service`) : undefined;
const isRouteWhitelisted = require('@config/whitelist.config');

module.exports = async function (req, res, next) {
  try {
    // If API endpoints authentication is disabled or requested path is whitelisted
    // or is a direct access to Grafana, skip to next middleware
    if (!isApiSecured || isRouteWhitelisted(req.path, req.method) ||
      (req.path === '/grafana' && !req.get('Referer')?.includes(req.get('Host')))) {
      console.log(`${!isApiSecured
        ? i18n.__('API JWT authentication is disabled')
        : i18n.__('Endpoint {{path}} is whitelisted', { path: req.path }).replace(/&#x2F;/g, '/')}. ${i18n.__('Skipping JWT validation')}...`);

      // Add friendly info to request
      req.isAuthenticated = !isApiSecured;
      req.role = !isApiSecured ? req.get('X-ROLE') : undefined;
      if (isMultitenantEnabled) {
        // Try to get tenant from JWT, if provided
        if (req.get('Authorization')?.split(' ')[0] === 'Bearer' ||
          (req.cookies.Authorization && decodeURIComponent(req.cookies.Authorization).split(' ')[0] === 'Bearer')) {
          const token = req.get('Authorization')?.split(' ')[1] || req.cookies.Authorization?.split(' ')[1];
          const payload = token ? jwt.verifyToken(token) : undefined;
          if (payload) {
            const queryObj = {};
            queryObj.username = payload.username;
            const user = await usersService.read(queryObj);
            if (user) req.tenant = user.tenantId;
          }
        }
        if (!req.tenant) {
          // Since there is no tenant available from JWT, get it from header or subdomain
          req.tenant = req.get('X-TENANT') || req.hostname.split('.')[0];
        }
        req.isSuperAdmin = (req.role === 'admin' && req.tenant === 'admin');
      }
    } else {
      // Get JWT from request header or cookie
      if (!req.get('Authorization') && !req.cookies.Authorization) throw httpErrors.create(401, res.__('Token not provided'));
      const [type, token] = req.get('Authorization')?.split(' ') || decodeURIComponent(req.cookies.Authorization).split(' ');
      if (type !== 'Bearer') throw httpErrors.create(401, res.__('Invalid authorization type'));
      if (!token) throw httpErrors.create(401, res.__('Token not provided'));

      // Extract token payload
      const payload = jwt.verifyToken(token);
      if (!payload) throw httpErrors.create(401, res.__('Invalid token'));

      // Get user entity
      const queryObj = {};
      queryObj.username = payload.username;
      const user = await usersService.read(queryObj);
      if (!user) throw httpErrors.create(404, res.__('User {{username}} not found', { username: payload.username }));

      console.log(i18n.__('User validated:'), user.username);
      req.user = user;

      // Add friendly info to request
      req.isAuthenticated = Boolean(req.user);
      // Role name must be provided as a string or as an object with a key called 'name' whose value is an string
      req.role = req.user.role.name ?? req.user.role;
      if (isMultitenantEnabled) {
        // Users can access more than one tenant and super admins can access any tenant
        if (isMultitenantCrossed) {
          req.isSuperAdmin = (req.role === 'admin' && user.tenants.map(tenant => tenant.id).includes('admin'));
          const requestedTenant = req.get('X-TENANT');
          if (!req.isSuperAdmin && !requestedTenant) throw httpErrors.create(400, 'Tenant header required');
          req.tenant = req.isSuperAdmin
            ? requestedTenant || user.tenants[0]
            : requestedTenant === 'admin'
              ? 'admin'
              : user.tenants.find(tenant => tenant.id === requestedTenant)?.id;
          if (!req.tenant) throw httpErrors.create(400, 'Tenant not allowed');
        }
        // Users can access just one tenant and super admins can access any tenant
        else {
          req.isSuperAdmin = (req.role === 'admin' && user.tenantId === 'admin');
          req.tenant = req.isSuperAdmin
            ? req.get('X-TENANT') || user.tenantId
            : user.tenantId;
        }
      }
    }

    if (isMultitenantEnabled) {
      const tenants = await tenantsService.list();
      const tenantsIds = tenants.map(tenant => tenant.id);
      if (!tenantsIds.includes(req.tenant)) throw httpErrors.create(401, 'Invalid tenant');
    }

    next();

  } catch (err) {
    next(err);
  }
};
