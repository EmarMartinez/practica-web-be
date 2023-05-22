'use strict';

const propertiesModel = require('./properties.model');
const { CrudRepository } = require('@shared/layers/crud.repository');

class PropertiesRepository extends CrudRepository {
  
}

module.exports = new PropertiesRepository(propertiesModel);
