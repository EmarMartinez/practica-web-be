'use strict';

const resourcesRepository = require('./resources.repository');
const { CrudService } = require('@shared/layers/crud.service');
const { adminFolder } = require('@config');
const propertiesService = require(`@api${adminFolder}/properties/properties.service`);
const associationsService = require(`@api${adminFolder}/associations/associations.service`);

class ResourcesService extends CrudService {

  async create(entityDTO, options = {}) {
    try {
      const { transactionId, tenant } = options;
      if (entityDTO.properties) {
        const properties = await this.properties.bulkCreate(entityDTO.properties);
        const propIds = properties.map(prop => prop.id);
        entityDTO.properties = propIds;
      }
      if (entityDTO.associations) {
        const associations = await this.associations.bulkCreate(entityDTO.associations);
        const assocIds = associations.map(assoc => assoc.id);
        entityDTO.associations = assocIds;
      }
      // A shallow copy of the entityDTO is made to avoid modifying the original req.body object
      // req.body will be reused by resources loader listener to instantiate resource controller at runtime
      let newEntity = await this.repository.create({ ...entityDTO }, options);

      this.emitEvents('create', newEntity, { transactionId, tenant })
      return newEntity;
    } catch (error) {
      this.emitErrorEvents('create', error);
      throw error;
    }
  }

};

module.exports = new ResourcesService(resourcesRepository, {
  dependencies: {
    properties: propertiesService,
    associations: associationsService
  }
});
