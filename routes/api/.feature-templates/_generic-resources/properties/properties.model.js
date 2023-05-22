'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('@config/sequelize.config');
const { isMultitenantEnabled } = require('@config');
const { notNull, setIsIn } = require('@config/validations.config');
const isIn = setIsIn(['string', 'integer', 'float', 'boolean', 'date']);

const options = {};

if (isMultitenantEnabled) {
  options.schema = 'admin';
}

const PropertiesModel = sequelize.define(
  'property',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false, validate: { notNull } },
    name: { type: DataTypes.STRING, unique: true, allowNull: false, validate: { notNull } },
    type: { type: DataTypes.STRING, allowNull: false, validate: { notNull, isIn } },
    allowNull: { type: DataTypes.BOOLEAN, allowNull: false, validate: { notNull } }
  },
  options
);

PropertiesModel.associate = function () {
  const model = modelName => this.sequelize.model(modelName);

  this.belongsToMany(model('resourceType'), { through: model('resourceTypeProperty') });
  console.debug('Property belongs to many ResourceTypes through ResourceTypeProperties');

  //! Resources models syncs with many schemas, which makes this association inappropriate from admin side
  //! Only uncomment for non-multitenant apps
  // this.belongsToMany(model('resource'), { through: model('resourceProperty') });
  // console.debug('Property belongs to many Resources through ResourceProperties');
};

module.exports = PropertiesModel;
