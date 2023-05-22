'use strict';

const associationsModel = require('./associations.model');
const { CrudRepository } = require('@shared/layers/crud.repository');

class AssociationsRepository extends CrudRepository {
  
}

module.exports = new AssociationsRepository(associationsModel);
