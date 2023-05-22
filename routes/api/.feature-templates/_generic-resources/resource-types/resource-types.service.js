'use strict';

const resourceTypesRepository = require('./resource-types.repository');
const { CrudService } = require('@shared/layers/crud.service');

class ResourceTypesService extends CrudService {

}

module.exports = new ResourceTypesService(resourceTypesRepository);
