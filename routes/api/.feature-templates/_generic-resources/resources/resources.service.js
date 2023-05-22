'use strict';

const resourcesRepository = require('./resources.repository');
const { CrudService } = require('@shared/layers/crud.service');

class ResourcesService extends CrudService {

}

module.exports = new ResourcesService(resourcesRepository);
