'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('@config/sequelize.config');
const { isMultitenantEnabled } = require('@config');
const { notNull } = require('@config/validations.config');
require('./resource-properties.model');

const ResourcesModel = sequelize.define(
  'resource',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false, validate: { notNull } },
    name: { type: DataTypes.STRING, allowNull: false, validate: { notNull } }
  },
  {}
);

ResourcesModel.associate = function () {
  const model = modelName => this.sequelize.model(modelName);

  this.belongsToMany(model('property'), { through: model('resourceProperty') });
  console.debug('Resource belongs to many Properties through ResourceProperties');

  //* Super many-to-many association for multitenancy
  //* Defined to make work properly many-to-many association between schemas
  //* (model 'property' belongs to 'admin' schema)
  if (isMultitenantEnabled) {
    this.hasMany(model('resourceProperty'));
    console.debug('Resource has many ResourceProperties');
  }
};

module.exports = ResourcesModel;
