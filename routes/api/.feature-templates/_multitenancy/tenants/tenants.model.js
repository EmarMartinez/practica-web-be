
'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('@config/sequelize.config');
const { notNull } = require('@config/validations.config');
const { isMultitenantEnabled, isMultitenantCrossed } = require('@config');

const TenantsModel = sequelize.define(
  'tenant',
  {
    id: { type: DataTypes.STRING, primaryKey: true, allowNull: false, validate: { notNull } },
    name: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { notNull } }
  },
  {
    schema: 'admin'
  }
);

if (isMultitenantEnabled && isMultitenantCrossed) {
  sequelize.define(
    'userTenant',
    {},
    {
      schema: 'admin'
    }
  );
}

TenantsModel.associate = function () {
  const model = modelName => this.sequelize.model(modelName);

  if (isMultitenantEnabled) {
    if (isMultitenantCrossed) {
      this.belongsToMany(model('user'), { through: model('userTenant') });
      console.debug('Tenant belongs to many Users');
    } else {
      this.hasMany(model('user'));
      console.debug('Tenant has many Users');
    }
  }
};

module.exports = TenantsModel;
