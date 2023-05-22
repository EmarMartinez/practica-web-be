'use strict';

const resourcesModel = require('./resources.model');
const { CrudRepository } = require('@shared/layers/crud.repository');

class ResourcesRepository extends CrudRepository {

}

module.exports = new ResourcesRepository(resourcesModel);
