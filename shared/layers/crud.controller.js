'use strict';

const { BaseCrudController } = require('./base/base-crud.controller');

class CrudController extends BaseCrudController {

}

exports.CrudController = CrudController;
exports.createController = (service, path) => new CrudController(service, path);
