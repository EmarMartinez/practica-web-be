'use strict';

const resourceTypesModel = require('./resource-types.model');
const { CrudRepository } = require('@shared/layers/crud.repository');

class ResourceTypesRepository extends CrudRepository {
  
}

module.exports = new ResourceTypesRepository(resourceTypesModel);
