'use strict';

const usersRepository = require('./users.repository');
const { CrudService } = require('@shared/layers/crud.service');
const hashService = require('./hash.service');
const { isMultitenantEnabled, isMultitenantCrossed } = require('@config');

class UsersService extends CrudService {

  async create(entityDTO, { transactionId, tenant, scope = 'defaultScope', ignoreSerialPk = true, createAssociatedEntities = false, updateAssociations = true, preload = false } = {}) {
    try {
      entityDTO.password = await this.hash.hashString(entityDTO.password);
      let newEntity = await this.repository.create(entityDTO, { transactionId, tenant, scope, ignoreSerialPk, createAssociatedEntities, updateAssociations, preload });

      this.emitEvents('create', newEntity, { transactionId, tenant });
      return newEntity;
    } catch (error) {
      this.emitErrorEvents('create', error);
      throw error;
    }
  }

  async update(entityQuery, entityDTO, { transactionId, tenant, scope = 'defaultScope', ignoreSerialPk = true, preload = false } = {}) {
    try {
      if (entityDTO.password) entityDTO.password = await this.hash.hashString(entityDTO.password);
      let [updatedEntity, previousEntity] = await this.repository.update(entityQuery, entityDTO, { transactionId, tenant, scope, ignoreSerialPk, preload });

      this.emitEvents('update', [updatedEntity, previousEntity], { transactionId, tenant });
      return [updatedEntity, previousEntity];
    } catch (error) {
      this.emitErrorEvents('update', error);
      throw error;
    }
  }

  async validate(entityDTO, partialValidation, id, locale, tenant) {
    if (this.isMultitenantEnabled && this.isMultitenantCrossed) {
      if (entityDTO.tenants?.length === 0) {
        return this.i18n.__({ phrase: 'Tenants field must not be empty', locale });
      }
    }
    return await this.repository.validate(entityDTO, partialValidation, locale, tenant);
  }

  async bulkCreate(entitiesDTO, { transactionId, tenant, scope = 'defaultScope', ignoreSerialPk = true, updateAssociations = true, preload = false } = {}) {
    try {
      for (const entityDTO of entitiesDTO) {
        if (entityDTO.password) entityDTO.password = await this.hash.hashString(entityDTO.password);
      }
      let newEntities = await this.repository.bulkCreate(entitiesDTO, { transactionId, tenant, scope, ignoreSerialPk, updateAssociations, preload });

      this.emitEvents('bulk create', newEntities, { transactionId, tenant });
      return newEntities;
    } catch (error) {
      this.emitErrorEvents('bulk create', error);
      throw error;
    }
  }

  async authenticate(username, plainPassword, tenant) {
    const user = await this.repository.read({ username }, { tenant, scope: null });
    if (!user) return;
    const match = await this.hash.compareStrings(plainPassword, user.password);
    delete user.password;
    return match ? user : undefined;
  }

}

module.exports = new UsersService(usersRepository, {
  dependencies: {
    hash: hashService,
    isMultitenantEnabled,
    isMultitenantCrossed
  }
});
