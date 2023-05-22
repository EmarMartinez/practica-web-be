'use strict';

const usersService = require('./users.service');
const { CrudController } = require('@shared/layers/crud.controller');
const jwtService = require('@shared/services/jwt.service');
const { isMultitenantEnabled, isMultitenantCrossed } = require('@config');

class UsersController extends CrudController {

  beforeValidate(req, res, next) {
    // Force superadmins to be associated just to admin tenant
    // (other tenants are accessed through X-TENANT header)
    if (this.isMultitenantEnabled && this.isMultitenantCrossed &&
      req.body.role === 'admin' && req.body.tenants?.includes('admin')) {
      req.body.tenants = ['admin'];
    }
    next();
  }

  async authenticate(req, res, next) {
    try {

      // Check credentials. If correct, user entity is returned
      const { username, password } = req.body;
      const user = await this.service.authenticate(username, password, req.tenant);
      if (!user) throw this.httpErrors.create(401, res.__('Invalid credentials'));

      // Create a new user token
      const payload = {};
      payload.username = user.username;
      const token = this.jwt.createToken(payload);

      res.cookie('Authorization', 'Bearer ' + token, { secure: true });

      res.json({
        success: true,
        message: this.successMessage(user.username, 'authenticated', res.__mf),
        result: {
          token,
          user: this.mapEntity(user)
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async refreshToken(req, res, next) {
    try {

      // Create a new user token
      const { user } = req;
      const payload = {};
      payload.username = user.username;
      const token = this.jwt.createToken(payload);

      res.cookie('Authorization', 'Bearer ' + token, { secure: true });

      res.json({
        success: true,
        message: this.successMessage(user.username, 'validated', res.__mf),
        result: {
          token,
          user: this.mapEntity(user)
        }
      });
    } catch (err) {
      next(err);
    }
  }

  logout(req, res, next) {
    try {
      // Empty cookie with immediate expiration period to be instantly removed by the browser
      res.cookie('Authorization', '', { maxAge: 0 });
      res.json({
        success: true,
        message: 'Successfully logged out'
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new UsersController(usersService, 'users', 'username', {
  dependencies: {
    jwt: jwtService,
    isMultitenantEnabled,
    isMultitenantCrossed
  },
  roles: ['admin'], // Only superadmins and admins can list, read, create, update, and delete
  additionalActions: [
    {
      name: 'authenticate',
      method: 'post',
      roles: ['any']
    },
    {
      name: 'refreshToken',
      method: 'get',
      roles: ['authenticated'],
      path: 'token'
    },
    {
      name: 'logout',
      method: 'get',
      roles: ['authenticated']
    }
  ],
  mapEntity: function (user, req) {
    delete user.password;
    if (this.isApiSecured && !req.isSuperAdmin) {
      delete user.tenantId;
      delete user.tenant;
    }
    return user;
  }
});
