
'use strict';

const tenantsRepository = require('./tenants.repository');
const { CrudService } = require('@shared/layers/crud.service');

class TenantsService extends CrudService {

  async create(entityDTO, { transactionId, tenant, scope = 'defaultScope', ignoreSerialPk = true, createAssociatedEntities = false, updateAssociations = true, preload = false, ignoreId = true } = {}) {
    try {
      let newEntity = await this.repository.create(entityDTO, { transactionId, tenant, scope, ignoreSerialPk, createAssociatedEntities, updateAssociations, ignoreId });

      this.emitEvents('create', newEntity, { transactionId, tenant });
      return newEntity;
    } catch (error) {
      this.emitErrorEvents('create', error);
      throw error;
    }
  }

  async bulkCreate(entitiesDTO, { transactionId, tenant, scope = 'defaultScope', ignoreSerialPk = true, updateAssociations = true, preload = false, ignoreIds = true, syncModels = true } = {}) {
    try {
      let newEntities = await this.repository.bulkCreate(entitiesDTO, { transactionId, tenant, scope, ignoreSerialPk, updateAssociations, ignoreIds, syncModels });

      this.emitEvents('bulk create', newEntities, { transactionId, tenant });
      return newEntities;
    } catch (error) {
      this.emitErrorEvents('bulk create', error);
      throw error;
    }
  }

  async validate(entityDTO, partialValidation, id, locale, tenant, ignoreId = true) {
    if (ignoreId && entityDTO.name) {
      entityDTO.id = this.repository.setTenantName(entityDTO.name);
    }
    let result = await this.repository.validate(entityDTO, partialValidation, locale, tenant);
    return result;
  }

}

module.exports = new TenantsService(tenantsRepository);
