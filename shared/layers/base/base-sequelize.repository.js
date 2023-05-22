'use strict';

const EventEmitter = require('events');
const { randomBytes } = require('crypto');
const { Op, ValidationError } = require('sequelize');
const i18n = require('@config/i18n.config');
const { listLimit, isMultitenantEnabled } = require('@config');
const sequelizeTransactionsService = require('@shared/services/sequelize-transactions.service');
const eventsService = require('@shared/services/events.service');

const queries = {
  waitList: [],
  events: new EventEmitter()
};

class BaseSequelizeRepository {

  constructor(model, options = {}) {
    this.randomBytes = randomBytes;
    this.model = model;
    this.Op = Op;
    this.ValidationError = ValidationError;
    this.i18n = i18n;
    this.listLimit = listLimit;
    this.isMultitenantEnabled = isMultitenantEnabled;
    this.transactions = sequelizeTransactionsService;
    this.events = eventsService.repositories;
    this.queries = queries;
    this.options = {
      dependencies: {},
      events: [],
      include: { all: true },
      includeOnList: undefined,
      includeOnRead: undefined,
      includeOnCreate: undefined,
      includeOnUpdate: undefined,
      includeOnDelete: undefined,
      operatorSeparator: '$'
    };

    for (const key in this.options) {
      if (options[key]) this.options[key] = options[key];
    }

    for (const key in this.options.dependencies) {
      this[key] = this.options.dependencies[key];
      delete this.options.dependencies[key];
    }

    for (const event of this.options.events) {
      this.events.on(event.name, this[event.listener].bind(this));
    }

    this.operators = [
      // Basics
      'eq', 'ne', 'is', 'not', 'or',
      // Comparisons
      'gt', 'gte', 'lt', 'lte', 'between', 'notBetween',
      // Other operators
      'in', 'notIn', 'like', 'notLike', 'startsWith', 'endsWith', 'substring', 'iLike', 'notILike',
      'regexp', 'notRegexp', 'iRegexp', 'notIRegexp'
    ];

    const includesToLoad = [];
    for (const key of ['include', 'includeOnList', 'includeOnRead', 'includeOnCreate', 'includeOnUpdate', 'includeOnDelete']) {
      if (this.hasModelsToLoad(this.options[key])) includesToLoad.push(key);
    }

    if (includesToLoad.length > 0) {
      this.events.once('models loaded', () => {
        includesToLoad.forEach(key => this.options[key] = this.loadIncludeClasses(this.options[key], this.model));
      });
    }

  }

  hasModelsToLoad(include) {
    if (!include) return false;
    if (!Array.isArray(include)) include = [include];
    for (const item of include) {
      if (item === 'all') return true;
      if (typeof item === 'string' && item.includes('.')) return true;
      if (item.constructor?.name === 'Object') {
        if (item.model && typeof item.model === 'string') return true;
        if (item.association && typeof item.association === 'string') return true;
        if (item.include && this.hasModelsToLoad(item.include)) return true;
      }
    }
    return false;
  }

  loadIncludeClasses(include, model) {
    if (!include) return;
    if (!Array.isArray(include)) include = [include];
    let newItems, allIndex;
    for (let [index, item] of include.entries()) {
      if (item.all === true || item === 'all') {
        allIndex = index;
        newItems = Object.keys(model.associations)
          .reduce((newItems, association) => {
            // if this associaiton is already declared in include, skip it
            if (include.some(includeItem =>
              // If includeItem is an Association, an aliased Model in an object or an Association in an object
              includeItem.as === association ||
              includeItem.association?.as === association ||
              // If includeItem is an Association name or an Association name in an object
              includeItem === association ||
              includeItem.association === association ||
              // If includeItem is a dot noted association
              typeof includeItem === 'string' && includeItem.split('.')[0] === association ||
              // If includeItem is a Model or a Model in an object
              includeItem.name === model.associations[association].target.name ||
              includeItem.model?.name === model.associations[association].target.name ||
              // If includeItem is a Model name or a Model name in an object
              includeItem === model.associations[association].target.name ||
              includeItem.model === model.associations[association].target.name
            )) return newItems;
            // Parse association as object if association type is has many
            if (model.associations[association].associationType === 'HasMany') {
              association = {
                association: model.associations[association],
                separate: true
              };
            }
            newItems.push(association);
            return newItems;
          }, []);
      } else if (typeof item === 'string' && !item.includes('.')) {
        if (model.associations[item].associationType === 'HasMany') {
          include[index] = {
            association: model.associations[item],
            separate: true
          };
        }
      } else if (typeof item === 'string' && item.includes('.')) {
        include[index] = this.parseDotNotedAssociation(item, model);
      } else if (item.constructor?.name === 'Object') {
        let associatedModel;
        if (item.model && typeof item.model === 'string') {
          associatedModel = model.sequelize.model(item.model);
          const association = item.as || Object.keys(model.associations)
            .find(association => model.associations[association].target.name === associatedModel.name);
          if (model.associations[association].associationType === 'HasMany') include[index].separate = true;
          include[index].model = associatedModel;
        }
        if (item.association && typeof item.association === 'string') {
          if (model.associations[item.association]?.associationType === 'HasMany') include[index].separate = true;
          include[index].association = model.associations[item.association];
        }
        if (item.include) include[index].include = this.loadIncludeClasses(item.include, associatedModel);
      }
    }

    if (allIndex !== undefined) include.splice(allIndex, 1);
    if (newItems?.length > 0) include.unshift(...newItems);

    include = this.aggregateIncludeEntries(include, model);

    return include;
  }

  aggregateIncludeEntries(include, model) {
    if (!Array.isArray(include) || include.length < 2) return include;

    const aggregatedInclude = [];

    for (const entry of include) {
      const associationName =
        entry.association?.as ||
        entry.as ||
        (typeof entry === 'string' && model.associations[entry]?.as) ||
        (entry.model?.name && Object.keys(model.associations)
          .find(association => model.associations[association].target.name === entry.model?.name)) ||
        (entry.name && Object.keys(model.associations)
          .find(association => model.associations[association].target.name === entry.name));

      const isCurrentAssociation = includeItem =>
        // If includeItem is an Association, an aliased Model in an object or an Association in an object
        includeItem.as === associationName ||
        includeItem.association?.as === associationName ||
        // If includeItem is an Association name
        (typeof includeItem === 'string' && model.associations[includeItem]?.as) === associationName ||
        // If includeItem is a Model or a Model in an object
        (includeItem.name && Object.keys(model.associations)
          .find(association => model.associations[association].target.name === includeItem.name) === associationName) ||
        (includeItem.model?.name && Object.keys(model.associations)
          .find(association => model.associations[association].target.name === includeItem.model?.name) === associationName);

      // If this entry was already aggregated in aggregatedInclude, skip it
      if (aggregatedInclude.some(isCurrentAssociation)) continue;

      const disaggregatedEntries = include.filter(isCurrentAssociation);

      if (disaggregatedEntries.length > 1) {
        let aggregatedEntry;
        // If no disaggregated entry has an include property, just keep the first one
        if (disaggregatedEntries.every(entry => !entry.include)) {
          aggregatedEntry = disaggregatedEntries[0];
        } else {
          aggregatedEntry = disaggregatedEntries
            .filter(entry => entry.include)
            .reduce((aggregatedEntry, entry) => {
              if (!Array.isArray(aggregatedEntry.include)) aggregatedEntry.include = [aggregatedEntry.include];
              aggregatedEntry.include = aggregatedEntry.include.concat(entry.include);
              return aggregatedEntry;
            });

          const modelName = aggregatedEntry.model?.name ||
            aggregatedEntry.association?.target?.name ||
            (typeof aggregatedEntry === 'string' && model.associations[aggregatedEntry].target.name) ||
            aggregatedEntry.name || aggregatedEntry.target?.name;

          const entryModel = model.sequelize.model(modelName);

          aggregatedEntry.include = this.aggregateIncludeEntries(aggregatedEntry.include, entryModel);
        }
        aggregatedInclude.push(aggregatedEntry);
      } else {
        aggregatedInclude.push(...disaggregatedEntries);
      }
    }

    return aggregatedInclude;
  }

  parseDotNotedAssociation(dotNotedAssociation, model) {
    if (!dotNotedAssociation.includes('.')) return;
    let [association, subAssociation, ...rest] = dotNotedAssociation.split('.');
    if (!model.associations[association]) {
      throw new Error(`Association ${association} does not exist in model ${model.name}`);
    }
    const childAssociation = model.associations[association];
    const childModel = childAssociation.target;
    if (subAssociation !== 'all' && !Object.keys(childModel.associations).includes(subAssociation)) {
      throw new Error(`Association ${subAssociation} does not exist in model ${childModel.name}`);
    }
    if (subAssociation === 'all') {
      subAssociation = Object.keys(childModel.associations)
        .map(association => {
          if (childModel.associations[association].associationType === 'HasMany') {
            association = {
              association: childModel.associations[association],
              separate: true
            };
          }
          return association;
        });
    }
    const include = { association: childAssociation };
    if (model.associations[association].associationType === 'HasMany') include.separate = true;
    if (rest.length === 0) {
      return {
        ...include,
        include: childModel.associations[subAssociation]?.associationType === 'HasMany'
          ? { association: childModel.associations[subAssociation], separate: true }
          : subAssociation
      };
    } else {
      return { ...include, include: this.parseDotNotedAssociation([subAssociation, ...rest].join('.'), childModel) };
    }
  }

  //* For further development
  createDotNotedInclude(include) {
    const dotNotedInclude = [];
    if (!Array.isArray(include)) include = [include];
    for (const item of include) {
      if (item.all === true) {
        dotNotedInclude.push(...this.getAssociationAttributes());
      } else if (typeof item === 'string') {
        dotNotedInclude.push(item);
      } else if (Object.getPrototypeOf(item).name === 'Model') {
        dotNotedInclude.push(Object.keys(this.model.associations)
          .find(assoc => this.model.associations[assoc].target.name === item.name));
      } else if (item.model) {
        let field = Object.keys(this.model.associations)
          .find(assoc => this.model.associations[assoc].target.name === item.model.name);
        if (item.include) field += '.' + this.createDotNotedInclude(item.include);
        dotNotedInclude.push(field);
      }
    }
    return dotNotedInclude;
  }

  filterInclude(dotNotedKey, value, model, include) {
    // If a where property is set to filter an array of entities, it will be set to true
    let hasFilteredArray = false;
    if (!dotNotedKey.includes('.')) return { include, hasFilteredArray };
    const [field, subfield, ...rest] = dotNotedKey.split('.');

    if (!model.associations[field]) return { include, hasFilteredArray };
    const childAssociation = model.associations[field];
    const childModel = childAssociation.target;

    if (!Array.isArray(include)) include = [include];
    // Make a shallow copy of original include
    include = include.map(item => item.constructor?.name === 'Object' ? { ...item } : item);

    if (rest.length === 0) {
      if (!Object.keys(childModel.rawAttributes).includes(subfield)) return { include, hasFilteredArray };
      let includeEntry = include.find(item => item.association?.as === childAssociation.as);
      if (includeEntry) {
        if (includeEntry.where) {
          includeEntry.where[subfield] = value;
          includeEntry.required = true;
          delete includeEntry.separate;
        } else {
          includeEntry.where = { [subfield]: value };
          includeEntry.required = true;
          delete includeEntry.separate;
        }
        if (['HasMany', 'BelongsToMany'].includes(model.associations[field].associationType)) hasFilteredArray = true;
      } else {
        includeEntry = include.find(item =>
          item.all === true ||
          item === field ||
          item.as === childAssociation.as ||
          item.name === childModel.name
        );
        if (includeEntry) {
          if (includeEntry === field) {
            include = include.filter(item => item !== field);
          } else if (includeEntry.as === childAssociation.as) {
            include = include.filter(item => item.as !== childAssociation.as);
          } else if (includeEntry.name === childModel.name) {
            include = include.filter(item => item.name !== childModel.name);
          }
          include.push({ association: childAssociation, where: { [subfield]: value }, required: true });
          if (['HasMany', 'BelongsToMany'].includes(model.associations[field].associationType)) hasFilteredArray = true;
        }
      }
      return { include, hasFilteredArray };
    } else {
      if (!Object.keys(childModel.associations).includes(subfield)) return { include, hasFilteredArray };
      let includeEntry = include.find(item => item.association?.as === childAssociation.as && item.include);
      if (includeEntry) {
        const result = this.filterInclude([subfield, ...rest].join('.'), value, childModel, includeEntry.include);
        includeEntry.include = result.include;
        if (includeEntry.include.required || includeEntry.include.some?.(item => item.required)) {
          includeEntry.required = true;
          delete includeEntry.separate;
        }
        if (includeEntry.include.where) delete includeEntry.include.separate;
        if (Array.isArray(includeEntry.include)) includeEntry.include = includeEntry.include.map(item => {
          if (item.where) delete item.separate;
          return item;
        });
        hasFilteredArray = result.hasFilteredArray;
      }
      return { include, hasFilteredArray };
    }
  }

  parseAttribute(key, value) {
    if (['true', 'false', 'null'].includes(value)) value = JSON.parse(value);
    if (!key.includes(this.options.operatorSeparator)) {
      return { parsedKey: key, parsedValue: value };
    }
    const [parsedKey, operator] = key.split(this.options.operatorSeparator);
    if (!this.operators.includes(operator)) return;
    if (['or', 'between', 'notBetween', 'in', 'notIn'].includes(operator) &&
      !Array.isArray(value)) {
      value = value.split(',')
        .map(item => ['true', 'false', 'null'].includes(item) ? JSON.parse(item) : item);
    }
    return { parsedKey, parsedValue: { [this.Op[operator]]: value } };
  }

  setOptions(entityQuery = {}, entityQueryOptions = {}, action = 'List') {
    const options = {};
    let hasFilteredArray = false;
    let include = this.loadIncludeClasses(entityQueryOptions.include, this.model) ||
      this.options[`includeOn${action}`] || this.options.include || [];
    if (!Array.isArray(include)) include = [include];

    // Make a shallow copy of original include
    options.include = include.map(item => item.constructor?.name === 'Object' ? { ...item } : item);

    for (const key in entityQuery) {
      const parsedAttribute = this.parseAttribute(key, entityQuery[key]);
      if (parsedAttribute) {
        const { parsedKey, parsedValue } = parsedAttribute;
        if (!key.includes('.')) {
          if (this.getAttributes().includes(parsedKey)) {
            if (options.where) {
              if (options.where[parsedKey] !== undefined) {
                if (options.where[parsedKey].constructor.name === 'Object') {
                  if (parsedValue.constructor.name === 'Object') {
                    options.where[parsedKey] = { ...options.where[parsedKey], ...parsedValue };
                  } else {
                    options.where[parsedKey] = { ...options.where[parsedKey], [this.Op.eq]: parsedValue };
                  }
                } else {
                  if (parsedValue.constructor.name === 'Object') {
                    options.where[parsedKey] = { [this.Op.eq]: options.where[parsedKey], ...parsedValue };
                  } else {
                    options.where[parsedKey] = { [this.Op.eq]: options.where[parsedKey], [this.Op.eq]: parsedValue };
                  }
                }
              } else {
                options.where[parsedKey] = parsedValue;
              }
            } else {
              options.where = { [parsedKey]: parsedValue };
            }
          }
        } else {
          const result = this.filterInclude(parsedKey, parsedValue, this.model, options.include);
          options.include = result.include;
          hasFilteredArray = result.hasFilteredArray;
        }
      }
    }

    if (action === 'List') {
      options.order = entityQueryOptions.order?.split(',').map(orderItem => {
        const column = orderItem.startsWith('-') ? orderItem.substring(1) : orderItem;
        const direction = orderItem.startsWith('-') ? 'DESC' : 'ASC';
        return [column, direction];
      });

      options.limit = entityQueryOptions.limit || this.listLimit;
      options.offset = entityQueryOptions.offset;

    }

    return { options, hasFilteredArray };

  }

  includeHasSeparateOption(include) {
    if (!include) return false;
    if (!Array.isArray(include)) include = [include];
    if (include.some(item => (item?.separate === true ||
      this.includeHasSeparateOption(item.include)))) return true;
  }

  generateRandomId() {
    return this.randomBytes(100).toString('base64').replace(/[/+=]/g, '').slice(0, 10);
  }

  async getQueryId() {
    const queryId = this.generateRandomId();
    this.queries.waitList.push(queryId);
    if (this.queries.waitList.length > 1) {
      await new Promise(resolve => this.queries.events.once(queryId, resolve));
    }
    return queryId;
  }

  callNextQuery(queryId) {
    this.queries.waitList = this.queries.waitList.filter(id => id !== queryId);
    if (this.queries.waitList.length > 0) this.queries.events.emit(this.queries.waitList[0]);
  }

  async list(entityQuery = {}, entityQueryOptions = {}, { transactionId, tenant, scope = 'defaultScope' } = {}) {
    const { options, hasFilteredArray } = this.setOptions(entityQuery, entityQueryOptions, 'List');

    let entities, queryId;
    if (this.isMultitenantEnabled) queryId = await this.getQueryId();

    try {
      if (tenant) this.changeTenant(tenant);
      entities = await this.model.scope(scope).findAll({
        ...options,
        transaction: this.transactions.get(transactionId)
      });
    } catch (error) {
      if (this.isMultitenantEnabled) this.callNextQuery(queryId);
      throw new Error(error.message);
    }

    if (this.isMultitenantEnabled) this.callNextQuery(queryId);

    for (const key in entityQuery) {
      // If query filters by a nested association, remove any result that includes
      // that association equal to null or empty array
      if (this.getAssociationAttributes().includes(key.split('.')[0])) {
        entities = entities.filter(entity => !(entity[key] === null || (Array.isArray(entity[key]) && entity[key].length === 0)));
      }
    }

    // If filtering options included a where property in an include object for HasMany or
    // BelongsToMany associations, the included results from this nested array are filtered and incomplete
    // Therefore, a new query is sent requesting the list of entity IDs retrieved from the first query
    // and using the original include property without where properties
    if (hasFilteredArray) {
      const primaryKeyName = Object.keys(this.model.primaryKeys)[0];

      let queryId;
      if (this.isMultitenantEnabled) queryId = await this.getQueryId();

      try {
        if (tenant) this.changeTenant(tenant);
        entities = await this.model.scope(scope).findAll({
          where: { [primaryKeyName]: { [this.Op.in]: entities.map(entity => entity[primaryKeyName]) } },
          include: this.options.includeOnList || this.options.include,
          order: options.order,
          transaction: this.transactions.get(transactionId)
        });
      } catch (error) {
        if (this.isMultitenantEnabled) this.callNextQuery(queryId);
        throw new Error(error.message);
      }

      if (this.isMultitenantEnabled) this.callNextQuery(queryId);
    }

    entities = entities.map(entity => entity.toJSON());

    return entities;
  }

  async read(entityQuery, { transactionId, tenant, scope = 'defaultScope' } = {}) {
    const { options, hasFilteredArray } = this.setOptions(entityQuery, {}, 'Read');

    let entity, queryId;
    if (this.isMultitenantEnabled) queryId = await this.getQueryId();

    try {
      if (tenant) this.changeTenant(tenant);
      entity = await this.model.scope(scope).findOne({
        ...options,
        transaction: this.transactions.get(transactionId)
      });
    } catch (error) {
      if (this.isMultitenantEnabled) this.callNextQuery(queryId);
      throw new Error(error.message);
    }

    if (this.isMultitenantEnabled) this.callNextQuery(queryId);

    // If filtering options included a where property in an include object for HasMany or
    // BelongsToMany associations, the included results from this nested array are filtered and incomplete
    // Therefore, a new query is sent requesting the entity ID retrieved from the first query
    // and using the original include property without where properties
    if (entity && hasFilteredArray) {
      const primaryKeyName = Object.keys(this.model.primaryKeys)[0];

      let queryId;
      if (this.isMultitenantEnabled) queryId = await this.getQueryId();

      try {
        if (tenant) this.changeTenant(tenant);
        entity = await this.model.scope(scope).findOne({
          where: { [primaryKeyName]: entity[primaryKeyName] },
          include: this.options.includeOnRead || this.options.include,
          transaction: this.transactions.get(transactionId)
        });
      } catch (error) {
        if (this.isMultitenantEnabled) this.callNextQuery(queryId);
        throw new Error(error.message);
      }

      if (this.isMultitenantEnabled) this.callNextQuery(queryId);
    }

    return entity ? entity.toJSON() : entity;
  }

  async create(entityDTO, { transactionId, tenant, scope = 'defaultScope', ignoreSerialPk = true, createAssociatedEntities = false, updateAssociations = true } = {}) {
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
      newEntity = await this.updateAssociations(newEntity, entityDTO, transactionId, tenant);
    }

    return newEntity.toJSON();
  }

  async update(entityQuery, entityDTO, { transactionId, tenant, scope = 'defaultScope', ignoreSerialPk = true } = {}) {
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

    if (this.isMultitenantEnabled) queryId = await this.getQueryId();

    try {
      if (tenant) this.changeTenant(tenant);
      await this.model.update(entityDTO, {
        where: options.where,
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
      updatedEntity = await this.updateAssociations(updatedEntity, entityDTO, transactionId, tenant);
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

  async count(entityQuery = {}, { transactionId, tenant, scope = 'defaultScope' } = {}) {

    const { options } = Object.keys(entityQuery).some(key => key.includes('.') || key.includes('$'))
      ? this.setOptions(entityQuery, {
        include: Object.keys(entityQuery)
          .filter(key => this.getAssociationAttributes().includes(key.split('.')[0]))
          .map(key => key.split('.').slice(0, -1).join('.'))
      })
      : { options: { where: entityQuery, include: [] } };

    delete options.limit;

    // If no nested entities were fetched from DB,
    // count() method will count table records
    if (options.include.length === 0) {
      let count, queryId;
      if (this.isMultitenantEnabled) queryId = await this.getQueryId();

      try {
        if (tenant) this.changeTenant(tenant);
        count = await this.model.count({
          where: options.where,
          transaction: this.transactions.get(transactionId)
        });
      } catch (error) {
        if (this.isMultitenantEnabled) this.callNextQuery(queryId);
        throw new Error(error.message);
      }

      if (this.isMultitenantEnabled) this.callNextQuery(queryId);

      return count;
    }
    // Otherwise, count() method does not work well with include option 
    // to just count table records, since it will count nested entities
    // Length of findAll() result will be sent instead.
    else {
      let entities, queryId;
      if (this.isMultitenantEnabled) queryId = await this.getQueryId();

      try {
        if (tenant) this.changeTenant(tenant);
        entities = await this.model.scope(scope).findAll({
          ...options,
          transaction: this.transactions.get(transactionId)
        });
      } catch (error) {
        if (this.isMultitenantEnabled) this.callNextQuery(queryId);
        throw new Error(error.message);
      }

      if (this.isMultitenantEnabled) this.callNextQuery(queryId);

      return entities.map(entity => entity.toJSON()).length;
    }
  }

  async validate(entityDTO, partialValidation, locale = this.i18n.getLocale(), tenant) {
    let validationResult, queryId;
    if (this.isMultitenantEnabled) queryId = await this.getQueryId();

    try {
      if (tenant) this.changeTenant(tenant);
      const builtEntity = this.model.build(entityDTO);
      const options = partialValidation ? { fields: Object.keys(entityDTO) } : undefined;
      validationResult = await builtEntity.validate(options);
    } catch (error) {
      if (this.isMultitenantEnabled) this.callNextQuery(queryId);

      if (error instanceof this.ValidationError) {
        // Return a translated error message instead of a Sequelize error object to keep layers separated
        const message = this.createValidationErrorMessage(error, locale);
        return message;
      } else {
        throw new Error(error.message);
      }
    }

    if (this.isMultitenantEnabled) this.callNextQuery(queryId);

    return validationResult;
  }

  createValidationErrorMessage(err, locale = this.i18n.getLocale()) {
    return err.errors.map(error => ({
      field: error.path,
      message: error.message,
      args: Array.isArray(error.validatorArgs)
        ? error.validatorArgs.toString().split(',').join(', ')
        : error.validatorArgs
    }))
      .map(error => this.i18n.__({ phrase: error.message, locale }, { field: error.field, args: error.args })).join('. ');
  }

  async bulkCreate(entitiesDTO, { transactionId, tenant, scope = 'defaultScope', ignoreSerialPk = true, updateAssociations = true } = {}) {
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
        return this.updateAssociations(entity, entityDTO, transactionId, tenant);
      }));
    }

    return newEntities.map(entity => entity.toJSON());
  }

  async bulkUpdate(entityQuery, entityDTO, { transactionId, tenant, scope = 'defaultScope' } = {}) {
    // Get auto incremental primary key, if exists
    const serialPk = Object.keys(entityDTO).find(attr => this.model.primaryKeys[attr]?.autoIncrement);
    // If DTO includes an auto incremental primary key, ignore it
    if (serialPk) delete entityDTO[serialPk];

    const { options, hasFilteredArray } = this.setOptions(entityQuery, {}, 'Update');

    let previousEntities, queryId;
    if (this.isMultitenantEnabled) queryId = await this.getQueryId();

    try {
      if (tenant) this.changeTenant(tenant);
      previousEntities = await this.model.scope(scope).findAll({
        ...options,
        transaction: this.transactions.get(transactionId)
      });
    } catch (error) {
      if (this.isMultitenantEnabled) this.callNextQuery(queryId);
      throw new Error(error.message);
    }

    if (this.isMultitenantEnabled) this.callNextQuery(queryId);

    const primaryKeyName = Object.keys(this.model.primaryKeys)[0];
    if (previousEntities.length === 0) throw new Error('No entity matches query criteria');

    // If filtering options included a where property in an include object for HasMany or
    // BelongsToMany associations, the included results from this nested array are filtered and incomplete
    // Therefore, a new query is sent requesting the entity ID retrieved from the first query
    // and using the original include property without where properties
    if (hasFilteredArray) {
      let queryId;
      if (this.isMultitenantEnabled) queryId = await this.getQueryId();

      try {
        if (tenant) this.changeTenant(tenant);
        previousEntities = await this.model.scope(scope).findAll({
          where: { [primaryKeyName]: previousEntities[primaryKeyName] },
          include: this.options.includeOnUpdate || this.options.include,
          transaction: this.transactions.get(transactionId)
        });
      } catch (error) {
        if (this.isMultitenantEnabled) this.callNextQuery(queryId);
        throw new Error(error.message);
      }

      if (this.isMultitenantEnabled) this.callNextQuery(queryId);
    }

    if (this.isMultitenantEnabled) queryId = await this.getQueryId();

    try {
      if (tenant) this.changeTenant(tenant);
      await this.model.update(entityDTO, {
        where: options.where,
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

    // If update action has modified entity query fields,
    // update entityQuery object to be able to retrieve and return an entity
    for (const key in entityDTO) {
      if (Object.hasOwnProperty.call(entityQuery, key)) entityQuery[key] = entityDTO[key];
    }

    const { options: newOptions } = this.setOptions(entityQuery, {}, 'Update');

    if (this.isMultitenantEnabled) queryId = await this.getQueryId();

    let updatedEntities;
    try {
      if (tenant) this.changeTenant(tenant);
      updatedEntities = await this.model.scope(scope).findAll({
        ...newOptions,
        transaction: this.transactions.get(transactionId)
      });
    } catch (error) {
      if (this.isMultitenantEnabled) this.callNextQuery(queryId);
      throw new Error(error.message);
    }

    if (this.isMultitenantEnabled) this.callNextQuery(queryId);

    if (updatedEntities.length === 0) throw new Error('No entity matches query criteria');

    // If filtering options included a where property in an include object for HasMany or
    // BelongsToMany associations, the included results from this nested array are filtered and incomplete
    // Therefore, a new query is sent requesting the entity ID retrieved from the first query
    // and using the original include property without where properties
    if (hasFilteredArray) {
      let queryId;
      if (this.isMultitenantEnabled) queryId = await this.getQueryId();

      try {
        if (tenant) this.changeTenant(tenant);
        updatedEntities = await this.model.scope(scope).findAll({
          where: { [primaryKeyName]: updatedEntities[primaryKeyName] },
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
      updatedEntities = await Promise.all(updatedEntities
        .map(updatedEntity => this.updateAssociations(updatedEntity, entityDTO, transactionId, tenant)));
    }
    return [updatedEntities.map(entity => entity.toJSON()), previousEntities.map(entity => entity.toJSON())];
  }

  async updateAssociations(entity, entityDTO, transactionId, tenant) {
    const associationAttributes = this.getAssociationAttributes();
    let queryId;
    for (const key in entityDTO) {
      if (associationAttributes.includes(key)) {
        const capitalizedKey = key.charAt(0).toUpperCase() + key.slice(1);
        if (
          Array.isArray(entityDTO[key]) && entityDTO[key].length > 0 &&
          entityDTO[key].every(item => Array.isArray(item) && item.length === 2)
        ) {
          for (const [index, item] of entityDTO[key].entries()) {
            const [associatedEntityId, additionalAttributes] = item;
            if (index === 0) {
              if (this.isMultitenantEnabled) queryId = await this.getQueryId();

              try {
                if (tenant) this.changeTenant(tenant);
                await entity[`set${capitalizedKey}`](associatedEntityId, {
                  through: additionalAttributes,
                  validate: true,
                  transaction: this.transactions.get(transactionId)
                });
              } catch (error) {
                if (this.isMultitenantEnabled) this.callNextQuery(queryId);
                throw new Error(error.message);
              }

              if (this.isMultitenantEnabled) this.callNextQuery(queryId);
            } else {
              if (this.isMultitenantEnabled) queryId = await this.getQueryId();

              try {
                if (tenant) this.changeTenant(tenant);
                await entity[`add${capitalizedKey}`](associatedEntityId, {
                  through: additionalAttributes,
                  validate: true,
                  transaction: this.transactions.get(transactionId)
                });
              } catch (error) {
                if (this.isMultitenantEnabled) this.callNextQuery(queryId);
                throw new Error(error.message);
              }

              if (this.isMultitenantEnabled) this.callNextQuery(queryId);
            }
          }
        } else {
          if (this.isMultitenantEnabled) queryId = await this.getQueryId();

          try {
            if (tenant) this.changeTenant(tenant);
            await entity[`set${capitalizedKey}`](entityDTO[key]);
          } catch (error) {
            if (this.isMultitenantEnabled) this.callNextQuery(queryId);
            throw new Error(error.message);
          }

          if (this.isMultitenantEnabled) this.callNextQuery(queryId);
        }
      }
    }

    if (this.isMultitenantEnabled) queryId = await this.getQueryId();

    try {
      if (tenant) this.changeTenant(tenant);
      await entity.reload();
    } catch (error) {
      if (this.isMultitenantEnabled) this.callNextQuery(queryId);
      throw new Error(error.message);
    }

    if (this.isMultitenantEnabled) this.callNextQuery(queryId);

    return entity;
  }

  getAttributes() {
    return Object.keys(this.model.rawAttributes);
  }

  getAssociationAttributes() {
    return Object.keys(this.model.associations);
  }

  changeTenant(tenantName) {
    if (tenantName === 'admin') return;
    const schemasToKeep = [tenantName, 'admin'];
    for (const modelName in this.model.sequelize.models) {
      const model = this.model.sequelize.model(modelName);
      if (!schemasToKeep.includes(model._schema)) model._schema = tenantName;
    }
  }

  getTenant() {
    return this.model.getTableName().schema;
  }

  hasTenantIdField() {
    return (this.model.rawAttributes.tenantId);
  }

  startTransaction() {
    return this.transactions.start();
  }

  commitTransaction(transactionId) {
    this.transactions.commit(transactionId);
  }

  rollbackTransaction(transactionId) {
    this.transactions.rollback(transactionId);
  }

  async setSerialSequence(tenant) {
    const serialPk = Object.keys(this.model.rawAttributes)
      .find(attr => this.model.rawAttributes[attr].primaryKey && this.model.rawAttributes[attr].autoIncrement);
    if (tenant) this.changeTenant(tenant);
    const { schema, delimiter, tableName } = this.model.getTableName();
    await this.model.sequelize
      .query(`SELECT setval('${schema}${delimiter}"${tableName}_${serialPk}_seq"', (SELECT MAX(${serialPk}) from "${schema}"${delimiter}"${tableName}"))`);
  }

}

exports.BaseSequelizeRepository = BaseSequelizeRepository;
exports.createRepository = (model, options) => new BaseSequelizeRepository(model, options);
