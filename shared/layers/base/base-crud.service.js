'use strict';

const i18n = require('@config/i18n.config');
const eventsService = require('@shared/services/events.service');

class BaseCrudService {

  constructor(repository, { dependencies = {}, events = [] } = {}) {
    this.repository = repository;
    this.i18n = i18n;
    this.events = eventsService.services;

    for (const key in dependencies) {
      this[key] = dependencies[key];
    }

    for (const event of events) {
      this.events.on(event.name, this[event.listener].bind(this));
    }

  }

  emitEvents(action, entityData, options) {
    ['response', `${this.entityName.toLowerCase()} response`, action, `${this.entityName.toLowerCase()} ${action}`]
      .forEach(event => this.events.emit(event, entityData, { action, ...options }));
  }

  emitErrorEvents(action, error) {
    ['response error', `${this.entityName.toLowerCase()} response error`, `${action} error`, `${this.entityName.toLowerCase()} ${action} error`]
      .forEach(event => this.events.emit(event, error));
  }

  listenToEvent(event, controller) {
    let resolveListener, rejectListener;
    return Promise.race([
      new Promise((resolve, reject) => {
        resolveListener = (...args) => {
          this.events.removeListener(event, rejectListener);
          resolve(args);
        };
        this.events.once(event, resolveListener);
        controller.signal.onabort(() => {
          this.events.removeListener(event, resolveListener);
          reject('Promise aborted');
        });
      }),
      new Promise((resolve, reject) => {
        rejectListener = error => {
          this.events.removeListener(event, resolveListener);
          reject(error);
        };
        this.events.once(event + ' error', rejectListener);
        controller.signal.onabort(() => {
          this.events.removeListener(event, rejectListener);
          reject('Promise aborted');
        });
      })
    ]);
  }

  listenToEvents(events) {
    const controller = new AbortController();
    try {
      const promises = events.map(event => this.listenToEvent(event, controller));
      return Promise.all(promises);
    } catch (error) {
      controller.abort();
      throw error;
    }
  }

  async list(entityQuery = {}, entityQueryOptions = {}, { transactionId, tenant, scope = 'defaultScope' } = {}) {
    try {
      let entities = await this.repository.list(entityQuery, entityQueryOptions, { transactionId, tenant, scope });

      this.emitEvents('list', entities, { transactionId, tenant });
      return entities;
    } catch (error) {
      this.emitErrorEvents('list', error);
      throw error;
    }
  }

  async read(entityQuery, { transactionId, tenant, scope = 'defaultScope' } = {}) {
    try {
      let entity = await this.repository.read(entityQuery, { transactionId, tenant, scope });

      this.emitEvents('read', entity, { transactionId, tenant });
      return entity;
    } catch (error) {
      this.emitErrorEvents('read', error);
      throw error;
    }
  }

  async create(entityDTO, { transactionId, tenant, scope = 'defaultScope', ignoreSerialPk = true, createAssociatedEntities = false, updateAssociations = true, preload = false } = {}) {
    try {
      let newEntity = await this.repository.create(entityDTO, { transactionId, tenant, scope, ignoreSerialPk, createAssociatedEntities, updateAssociations });

      this.emitEvents('create', newEntity, { transactionId, tenant, preload });
      return newEntity;
    } catch (error) {
      this.emitErrorEvents('create', error);
      throw error;
    }
  }

  async update(entityQuery, entityDTO, { transactionId, tenant, scope = 'defaultScope', ignoreSerialPk = true, preload = false } = {}) {
    try {
      let [updatedEntity, previousEntity] = await this.repository.update(entityQuery, entityDTO, { transactionId, tenant, scope, ignoreSerialPk });

      this.emitEvents('update', [updatedEntity, previousEntity], { transactionId, tenant, preload });
      return [updatedEntity, previousEntity];
    } catch (error) {
      this.emitErrorEvents('update', error);
      throw error;
    }
  }

  async delete(entityQuery, { transactionId, tenant, scope = 'defaultScope' } = {}) {
    try {
      let deletedEntity = await this.repository.delete(entityQuery, { transactionId, tenant, scope });

      this.emitEvents('delete', deletedEntity, { transactionId, tenant });
      return deletedEntity;
    } catch (error) {
      this.emitErrorEvents('delete', error);
      throw error;
    }
  }

  async bulkCreate(entityDTOs, { transactionId, tenant, scope = 'defaultScope', ignoreSerialPk = true, updateAssociations = true, preload = false } = {}) {
    try {
      let newEntities = await this.repository.bulkCreate(entityDTOs, { transactionId, tenant, scope, ignoreSerialPk, updateAssociations });

      this.emitEvents('bulk create', newEntities, { transactionId, tenant, preload });
      return newEntities;
    } catch (error) {
      this.emitErrorEvents('bulk create', error);
      throw error;
    }
  }

  async bulkUpdate(entityQuery, entityDTO, { transactionId, tenant, scope = 'defaultScope', preload = false } = {}) {
    try {
      let [updatedEntities, previousEntities] = await this.repository.bulkUpdate(entityQuery, entityDTO, { transactionId, tenant, scope });

      this.emitEvents('bulk update', [updatedEntities, previousEntities], { transactionId, tenant, preload });
      return [updatedEntities, previousEntities];
    } catch (error) {
      this.emitErrorEvents('bulk update', error);
      throw error;
    }
  }

  async count(entityQuery = {}, entityQueryOptions = {}, { transactionId, tenant, scope = 'defaultScope' } = {}) {
    let totalEntities = await this.repository.count(entityQuery, entityQueryOptions, { transactionId, tenant, scope });
    return totalEntities;
  }

  async validate(entityDTO, partialValidation, id, locale, tenant, preload) {
    let result = await this.repository.validate(entityDTO, partialValidation, locale, tenant, preload);
    return result;
  }

  getAttributes() {
    return this.repository.getAttributes();
  }

  getAssociationAttributes() {
    return this.repository.getAssociationAttributes();
  }

  getTenant() {
    return this.repository.getTenant();
  }

  hasTenantIdField() {
    return this.repository.hasTenantIdField();
  }

}

exports.BaseCrudService = BaseCrudService;
exports.createService = (repository, options) => new BaseCrudService(repository, options);
