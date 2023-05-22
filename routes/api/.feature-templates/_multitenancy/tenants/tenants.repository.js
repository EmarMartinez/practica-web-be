
'use strict';

const tenantsModel = require('./tenants.model');
const { CrudRepository } = require('@shared/layers/crud.repository');

class TenantsRepository extends CrudRepository {

  setTenantName(name) {
    const words = name
      .toLowerCase()
      // Remove accents
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Get array of words
      .split(' ');
    // use first letter from every word, except the last one
    const id = words.reduce((string, word, index) => index === words.length - 1
      ? string + word
      : string + word.charAt(0), '');
    return id;
  }

  async create(entityDTO, { transactionId, tenant, scope = 'defaultScope', ignoreSerialPk = true, createAssociatedEntities = false, updateAssociations = true, ignoreId = true } = {}) {
    if (ignoreId) entityDTO.id = this.setTenantName(entityDTO.name);
    // Sync models in new tenant
    await this.model.sequelize.createSchema(entityDTO.id);
    console.log(this.i18n.__('Schema {{schema}} created', { schema: entityDTO.id }));
    if (entityDTO.id === 'admin') {
      await this.model.sequelize.createSchema('temp');
      this.changeTenant(undefined);
      await this.model.sequelize.sync({ schema: 'temp' });
      await this.model.sequelize.dropSchema('temp');
    } else {
      this.changeTenant(undefined);
      await this.model.sequelize.sync({ schema: entityDTO.id });
    }

    // Save new tenant in DB
    // Get auto incremental primary key, if exists
    const serialPk = Object.keys(entityDTO).find(attr => this.model.primaryKeys[attr]?.autoIncrement);
    // If DTO includes an auto incremental primary key, delete it if enabled
    if (serialPk && ignoreSerialPk) delete entityDTO[serialPk];

    const associationAttributes = this.getAssociationAttributes();
    if (!createAssociatedEntities) {
      for (const key in entityDTO) {
        // Delete DTO keys that are objects (nested entity representations)
        if (associationAttributes.includes(key) && entityDTO[key].constructor?.name === 'Object') {
          delete entityDTO[key];
        }
      }
    }

    let newEntity, queryId;
    if (this.isMultitenantEnabled) queryId = await this.getQueryId();

    try {
      if (tenant) this.changeTenant(tenant);
      newEntity = await this.model.create(entityDTO, {
        transaction: this.transactions.get(transactionId)
      });
    } catch (error) {
      if (this.isMultitenantEnabled) this.callNextQuery(queryId);

      if (error instanceof this.ValidationError) {
        // Return a translated error message instead of a Sequelize error object to keep layers separated
        const message = this.createValidationErrorMessage(error);
        throw new Error(message);
      } else {
        throw new Error(error.message);
      }
    }

    if (this.isMultitenantEnabled) this.callNextQuery(queryId);

    // If DTO includes an auto incremental primary key and was not ignored, set correct current max value
    if (serialPk && !ignoreSerialPk) await this.setSerialSequence(tenant);

    const primaryKeyName = Object.keys(this.model.primaryKeys)[0];

    if (this.isMultitenantEnabled) queryId = await this.getQueryId();

    try {
      if (tenant) this.changeTenant(tenant);
      newEntity = await this.model.scope(scope).findOne({
        where: { [primaryKeyName]: newEntity[primaryKeyName] },
        include: this.options.includeOnCreate || this.options.include,
        transaction: this.transactions.get(transactionId)
      });
    } catch (error) {
      if (this.isMultitenantEnabled) this.callNextQuery(queryId);
      throw new Error(error.message);
    }

    if (this.isMultitenantEnabled) this.callNextQuery(queryId);

    if (!newEntity) throw new Error(`Entity '${entityDTO[primaryKeyName] ||
      entityDTO[Object.keys(entityDTO)[0]]}' could not be created`);

    // If associations were defined for the model,
    // update the associated fields
    if (updateAssociations && Object.keys(entityDTO)
      .some(key => associationAttributes.includes(key) &&
        (['number', 'string'].includes(typeof entityDTO[key]) ||
          entityDTO[key].constructor?.name == 'Array'))) {
      if (createAssociatedEntities) {
        for (const key in entityDTO) {
          // Delete DTO keys that are objects (nested entity representations)
          if (associationAttributes.includes(key) && entityDTO[key].constructor?.name === 'Object') {
            delete entityDTO[key];
          }
        }
      }
      newEntity = await this.updateAssociations(newEntity, entityDTO, transactionId);
    }

    return newEntity.toJSON();
  }

  async update(entityQuery, entityDTO, { transactionId, tenant, scope = 'defaultScope', ignoreSerialPk = true, ignoreId = true } = {}) {
    // Get auto incremental primary key, if exists
    const serialPk = Object.keys(entityDTO).find(attr => this.model.primaryKeys[attr]?.autoIncrement);
    // If DTO includes an auto incremental primary key, ignore it if enabled
    if (serialPk && ignoreSerialPk) delete entityDTO[serialPk];

    const { options, hasFilteredArray } = this.setOptions(entityQuery, {}, 'Update');

    let previousEntity, queryId;
    if (this.isMultitenantEnabled) queryId = await this.getQueryId();

    try {
      if (tenant) this.changeTenant(tenant);
      previousEntity = await this.model.scope(scope).findOne({
        ...options,
        transaction: this.transactions.get(transactionId)
      });
    } catch (error) {
      if (this.isMultitenantEnabled) this.callNextQuery(queryId);
      throw new Error(error.message);
    }

    if (this.isMultitenantEnabled) this.callNextQuery(queryId);

    const primaryKeyName = Object.keys(this.model.primaryKeys)[0];
    if (!previousEntity) throw new Error(`Entity ${entityQuery[primaryKeyName]} does not exist`);

    // If filtering options included a where property in an include object for HasMany or
    // BelongsToMany associations, the included results from this nested array are filtered and incomplete
    // Therefore, a new query is sent requesting the entity ID retrieved from the first query
    // and using the original include property without where properties
    if (hasFilteredArray) {
      let queryId;
      if (this.isMultitenantEnabled) queryId = await this.getQueryId();

      try {
        if (tenant) this.changeTenant(tenant);
        previousEntity = await this.model.scope(scope).findOne({
          where: { [primaryKeyName]: previousEntity[primaryKeyName] },
          include: this.options.includeOnUpdate || this.options.include,
          transaction: this.transactions.get(transactionId)
        });
      } catch (error) {
        if (this.isMultitenantEnabled) this.callNextQuery(queryId);
        throw new Error(error.message);
      }

      if (this.isMultitenantEnabled) this.callNextQuery(queryId);
    }

    if (!serialPk) {
      // Prevent id from direct change
      if (ignoreId) entityDTO.id = previousEntity.id;

      // Change id and schema name only if tenant name is edited
      if (previousEntity.name !== entityDTO.name) {
        entityDTO.id = this.setTenantName(entityDTO.name);
        await this.model.sequelize.query(`ALTER SCHEMA ${previousEntity.id} RENAME TO ${entityDTO.id};`);
        console.log(this.i18n.__('Schema {{schema}} updated', { schema: entityDTO.id }));
      }
    }

    // Update tenant in DB
    if (this.isMultitenantEnabled) queryId = await this.getQueryId();

    try {
      if (tenant) this.changeTenant(tenant);
      await this.model.update(entityDTO, {
        where: options.where,
        transaction: this.transactions.get(transactionId)
      });
    } catch (err) {
      if (this.isMultitenantEnabled) this.callNextQuery(queryId);

      if (err instanceof this.ValidationError) {
        // Return a translated error message instead of a Sequelize error object to keep layers separated
        const message = this.createValidationErrorMessage(err);
        throw new Error(message);
      } else {
        throw new Error(err.message);
      }
    }

    if (this.isMultitenantEnabled) this.callNextQuery(queryId);

    // If DTO includes an auto incremental primary key and was not ignored, set correct current max value
    if (serialPk && !ignoreSerialPk) await this.setSerialSequence(tenant);

    // If update action has modified entity query fields,
    // update entityQuery object to be able to retrieve and return an entity
    for (const key in entityDTO) {
      if (Object.hasOwnProperty.call(entityQuery, key)) entityQuery[key] = entityDTO[key];
    }

    const { options: newOptions } = this.setOptions(entityQuery, {}, 'Update');

    if (this.isMultitenantEnabled) queryId = await this.getQueryId();

    let updatedEntity;
    try {
      if (tenant) this.changeTenant(tenant);
      updatedEntity = await this.model.scope(scope).findOne({
        ...newOptions,
        transaction: this.transactions.get(transactionId)
      });
    } catch (error) {
      if (this.isMultitenantEnabled) this.callNextQuery(queryId);
      throw new Error(error.message);
    }

    if (this.isMultitenantEnabled) this.callNextQuery(queryId);

    if (!updatedEntity) throw new Error(`Entity ${entityQuery[primaryKeyName]} does not exist`);

    // If filtering options included a where property in an include object for HasMany or
    // BelongsToMany associations, the included results from this nested array are filtered and incomplete
    // Therefore, a new query is sent requesting the entity ID retrieved from the first query
    // and using the original include property without where properties
    if (hasFilteredArray) {
      let queryId;
      if (this.isMultitenantEnabled) queryId = await this.getQueryId();

      try {
        if (tenant) this.changeTenant(tenant);
        updatedEntity = await this.model.scope(scope).findOne({
          where: { [primaryKeyName]: updatedEntity[primaryKeyName] },
          include: this.options.includeOnUpdate || this.options.include,
          transaction: this.transactions.get(transactionId)
        });
      } catch (error) {
        if (this.isMultitenantEnabled) this.callNextQuery(queryId);
        throw new Error(error.message);
      }

      if (this.isMultitenantEnabled) this.callNextQuery(queryId);
    }

    // If associations were defined for the model,
    // update the associated fields
    const associationAttributes = this.getAssociationAttributes();
    if (Object.keys(entityDTO)
      .some(key => associationAttributes.includes(key) &&
        (['number', 'string'].includes(typeof entityDTO[key]) ||
          entityDTO[key].constructor?.name == 'Array'))) {
      updatedEntity = await this.updateAssociations(updatedEntity, entityDTO, transactionId);
    }
    return [updatedEntity.toJSON(), previousEntity.toJSON()];
  }

  async delete(entityQuery, { transactionId, tenant, scope = 'defaultScope' } = {}) {
    const { options, hasFilteredArray } = this.setOptions(entityQuery, {}, 'Delete');

    let deletedEntity, queryId;
    if (this.isMultitenantEnabled) queryId = await this.getQueryId();

    try {
      if (tenant) this.changeTenant(tenant);
      deletedEntity = await this.model.scope(scope).findOne({
        ...options,
        transaction: this.transactions.get(transactionId)
      });
    } catch (error) {
      if (this.isMultitenantEnabled) this.callNextQuery(queryId);
      throw new Error(error.message);
    }

    if (this.isMultitenantEnabled) this.callNextQuery(queryId);

    const primaryKeyName = Object.keys(this.model.primaryKeys)[0];
    if (!deletedEntity) throw new Error(`Entity ${entityQuery[primaryKeyName]} does not exist`);

    // If filtering options included a where property in an include object for HasMany or
    // BelongsToMany associations, the included results from this nested array are filtered and incomplete
    // Therefore, a new query is sent requesting the entity ID retrieved from the first query
    // and using the original include property without where properties
    if (hasFilteredArray) {
      let queryId;
      if (this.isMultitenantEnabled) queryId = await this.getQueryId();

      try {
        if (tenant) this.changeTenant(tenant);
        deletedEntity = await this.model.scope(scope).findOne({
          where: { [primaryKeyName]: deletedEntity[primaryKeyName] },
          include: this.options.includeOnDelete || this.options.include,
          transaction: this.transactions.get(transactionId)
        });
      } catch (error) {
        if (this.isMultitenantEnabled) this.callNextQuery(queryId);
        throw new Error(error.message);
      }

      if (this.isMultitenantEnabled) this.callNextQuery(queryId);
    }

    // Delete schema
    await this.model.sequelize.dropSchema(deletedEntity.id);
    console.log(this.i18n.__('Schema {{schema}} dropped', { schema: deletedEntity.id }));

    // Delete tenant from DB
    if (this.isMultitenantEnabled) queryId = await this.getQueryId();

    try {
      if (tenant) this.changeTenant(tenant);
      await this.model.destroy({ where: options.where, transaction: this.transactions.get(transactionId) });
    } catch (error) {
      if (this.isMultitenantEnabled) this.callNextQuery(queryId);
      throw new Error(error.message);
    }

    if (this.isMultitenantEnabled) this.callNextQuery(queryId);

    return deletedEntity ? deletedEntity.toJSON() : deletedEntity;
  }

  async bulkCreate(entitiesDTO, { transactionId, tenant, scope = 'defaultScope', ignoreSerialPk = true, updateAssociations = true, ignoreIds = true, syncModels = true } = {}) {
    // Sync models in each tenant
    if (syncModels) {
      for (const tenant of entitiesDTO) {
        if (ignoreIds) tenant.id = this.setTenantName(tenant.name);
        await this.model.sequelize.createSchema(tenant.id);
        console.log(this.i18n.__('Schema {{schema}} created', { schema: tenant.id }));
        if (tenant.id === 'admin' && entitiesDTO.length === 1) {
          await this.model.sequelize.createSchema('temp');
          this.changeTenant(undefined);
          await this.model.sequelize.sync({ schema: 'temp' });
          await this.model.sequelize.dropSchema('temp');
        } else if (tenant.id !== 'admin') {
          this.changeTenant(undefined);
          await this.model.sequelize.sync({ schema: tenant.id });
        }
      }
    }

    // Save new tenants in DB
    if (ignoreSerialPk) {
      for (const entityDTO of entitiesDTO) {
        // Get auto incremental primary key, if exists
        const serialPk = Object.keys(entityDTO).find(attr => this.model.primaryKeys[attr]?.autoIncrement);
        // If DTO includes an auto incremental primary key, ignore it if enabled
        if (serialPk) delete entityDTO[serialPk];
      }
    }

    let newEntities, queryId;
    if (this.isMultitenantEnabled) queryId = await this.getQueryId();

    try {
      if (tenant) this.changeTenant(tenant);
      newEntities = await this.model.bulkCreate(entitiesDTO, {
        validate: true,
        ignoreDuplicates: true,
        transaction: this.transactions.get(transactionId)
      });
    } catch (error) {
      if (this.isMultitenantEnabled) this.callNextQuery(queryId);
      throw new Error(error.message);
    }

    if (this.isMultitenantEnabled) this.callNextQuery(queryId);

    // If DTO includes an auto incremental primary key and was not ignored, set correct current max value
    if (!ignoreSerialPk && entitiesDTO
      .some(entityDTO => Object.keys(entityDTO).find(attr => this.model.primaryKeys[attr]?.autoIncrement))
    ) await this.setSerialSequence(tenant);

    const primaryKeyName = Object.keys(this.model.primaryKeys)[0];

    if (this.isMultitenantEnabled) queryId = await this.getQueryId();

    try {
      if (tenant) this.changeTenant(tenant);
      newEntities = await this.model.scope(scope).findAll({
        where: { [primaryKeyName]: { [this.Op.in]: newEntities.map(entity => entity[primaryKeyName]) } },
        include: this.options.includeOnCreate || this.options.include,
        transaction: this.transactions.get(transactionId)
      });
    } catch (error) {
      if (this.isMultitenantEnabled) this.callNextQuery(queryId);
      throw new Error(error.message);
    }

    if (this.isMultitenantEnabled) this.callNextQuery(queryId);

    const associationAttributes = this.getAssociationAttributes();

    // If associations were defined for the model,
    // update the associated fields
    if (updateAssociations &&
      entitiesDTO.some(entityDTO => {
        return Object.keys(entityDTO)
          .some(key => associationAttributes.includes(key) &&
            (['number', 'string'].includes(typeof entityDTO[key]) ||
              entityDTO[key].constructor?.name == 'Array'));
      })) {
      newEntities = await Promise.all(newEntities.map(entity => {
        const entityDTO = entitiesDTO.find(DTO => DTO[primaryKeyName] === entity[primaryKeyName]);
        return this.updateAssociations(entity, entityDTO, transactionId);
      }));
    }

    return newEntities.map(entity => entity.toJSON());
  }

}

module.exports = new TenantsRepository(tenantsModel);
