'use strict';

const inflection = require('inflection');
const { DataTypes } = require('sequelize');
const sequelize = require('@config/sequelize.config');
const { notNull } = require('@config/validations.config');
const BaseService = require('@shared/services/base/base.service');
const { CrudRepository } = require('@shared/layers/crud.repository');
const { CrudService } = require('@shared/layers/crud.service');
const { CrudController } = require('@shared/layers/crud.controller');
const { adminFolder, isMultitenantEnabled, isMultitenantSeparate } = require('@config');
const { schema: schemaName } = require('@config').sequelize;
const resourcesService = require(`@api${adminFolder}/resources/resources.service`);
const apiRouter = require('@api/api.router');

// Import tenants service only if multitenant is enabled
const tenantsService = isMultitenantEnabled ? require(`@api${adminFolder}/tenants/tenants.service`) : undefined;

class LayersService extends BaseService {

  sequelize = sequelize;
  models = {};
  repositories = {};
  services = {};
  controllers = {};

  async createModel(DTO) {
    const properties = {};
    for (const prop of DTO.properties) {
      properties[prop.field] = {};
      properties[prop.field].type = DataTypes[prop.type.toUpperCase()];
      properties[prop.field].allowNull = prop.allowNull;
      if (!prop.allowNull) properties[prop.field].validate = { notNull };
    }
    const schema = this.isMultitenantEnabled
      ? this.isMultitenantSeparate ? DTO.tenantId : undefined
      : schemaName;

    const resourceModel = this.sequelize.define(
      inflection.singularize(DTO.path),
      properties,
      {
        tableName: DTO.path,
        schema
      }
    );

    if (DTO.associations?.length > 0) {

      for (const association of DTO.associations) {
        // Create join tables for many to many assocations if missing
        if (association.type === 'belongsToMany') {
          const sourceModelName = resourceModel.name;
          const targetModelName = inflection.singularize(association.target.path);
          try {
            association.through = this.sequelize.model(sourceModelName + targetModelName);
          } catch (error) {
            try {
              association.through = this.sequelize.model(targetModelName + sourceModelName);
            } catch (error) {
              association.through = this.sequelize.define(sourceModelName + targetModelName, {}, { schema });
            }
          }
        }
      }

      resourceModel.associate = function () {
        const model = modelName => this.sequelize.model(modelName);
        const capitalize = string => string.charAt(0).toUpperCase() + string.slice(1);
        const associationsDict = {
          hasOne: 'has one', hasMany: 'has many', belongsTo: 'belongs to', belongsToMany: 'belongs to many'
        };

        for (const association of DTO.associations) {
          const modelName = inflection.singularize(association.target.path);
          const source = inflection.singularize(capitalize(this.name));
          const method = association.type.endsWith('Many') ? 'pluralize' : 'singularize';
          const target = inflection[method](capitalize(association.target.path));
          const through = association.type === 'belongsToMany' ? association.through : undefined;
          this[association.type](model(modelName), { through });
          console.debug(
            `${source} ${associationsDict[association.type]} ${target}${through ? ` through ${capitalize(through.name)}` : ''}`);
        }
      };
    }

    this.models[DTO.path + 'Model'] = resourceModel;

    return resourceModel;
  }

  async createRepository(DTO) {
    const model = await this.createModel(DTO);
    const repository = new CrudRepository(model, { include: { all: true } });
    this.repositories[DTO.path + 'Repository'] = repository;
    return repository;
  }

  async createService(DTO) {
    const repository = await this.createRepository(DTO);
    const service = new CrudService(repository);
    this.services[DTO.path + 'Service'] = service;
    return service;
  }

  async createController(DTO) {
    const service = await this.createService(DTO);
    const controller = new CrudController(service, DTO.path, 'id');
    this.controllers[DTO.path + 'Controller'] = controller;
    return controller;
  }

  async createLayers() {
    const resources = await this.resources.list();
    for (const resource of resources) {
      const controller = await this.createController(resource);
      const tenantPath = (this.isMultitenantEnabled && this.isMultitenantSeparate) ? `/${resource.tenantId}` : '';
      this.apiRouter.use(`${tenantPath}${controller.path}`, controller.router);
    }
    for (const repository of Object.values(this.repositories)) {
      if (Object.hasOwnProperty.call(repository.model, 'associate')) repository.model.associate();
    }
    if (this.isMultitenantEnabled && !this.isMultitenantSeparate) {
      const tenants = this.tenants.list({ id$ne: 'admin' });
      tenants.forEach(async (tenant) => await this.sequelize.sync({ schema: tenant.id }));
    } else {
      await this.sequelize.sync();
    }
  }

  async handleResourceCreate(newEntity) {
    const controller = await this.createController(newEntity);
    const { model } = controller.service.repository;
    if (Object.hasOwnProperty.call(model, 'associate')) model.associate();
    await model.sync();
    const tenantPath = (this.isMultitenantEnabled && this.isMultitenantSeparate) ? `/${newEntity.tenantId}` : '';
    this.apiRouter.use(`${tenantPath}${controller.path}`, controller.router);
  }

}

module.exports = new LayersService({
  dependencies: {
    isMultitenantEnabled,
    isMultitenantSeparate,
    resources: resourcesService,
    tenants: tenantsService,
    apiRouter
  },
  events: [
    { name: 'resource create', listener: 'handleResourceCreate' }
  ]
});
