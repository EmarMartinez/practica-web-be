'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('@config/sequelize.config');
const { isMultitenantEnabled, isMultitenantSeparate } = require('@config');
const { notNull } = require('@config/validations.config');

const attributes = {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false, validate: { notNull } },
  name: { type: DataTypes.STRING, allowNull: false, validate: { notNull } },
  path: { type: DataTypes.STRING, allowNull: false, validate: { notNull } }
};

const options = {};

if (isMultitenantEnabled) {
  options.schema = 'admin';
  if (isMultitenantSeparate) {
    attributes.tenantId = { type: DataTypes.STRING, allowNull: false, validate: { notNull } };
  }
}

const ResourcesModel = sequelize.define('resource', attributes, options);

ResourcesModel.associate = function () {
  const model = modelName => this.sequelize.model(modelName);

  if (isMultitenantEnabled && isMultitenantSeparate) {
    this.belongsTo(model('tenant'));
    console.debug('Resource belongs to Tenant');
  }

  this.hasMany(model('property'));
  console.debug('Resource has many Properties');

  this.hasMany(model('association'));
  console.debug('Resource has many Associations');
};

module.exports = ResourcesModel;
