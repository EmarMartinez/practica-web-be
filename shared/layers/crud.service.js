'use strict';

const { BaseCrudService } = require('./base/base-crud.service');

class CrudService extends BaseCrudService {

}

exports.CrudService = CrudService;
exports.createService = (repository) => new CrudService(repository);
