
'use strict';

const tenantsService = require('./tenants.service');
const { CrudController } = require('@shared/layers/crud.controller');

class TenantsController extends CrudController {

}

module.exports = new TenantsController(tenantsService, 'tenants', 'id', {
  roles: [], // With empty array, only superadmin role can access
  mapEntity: function (item) {
    item.users?.map(user => {
      delete user.password;
      return user;
    });
    return item;
  }
});
