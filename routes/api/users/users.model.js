'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('@config/sequelize.config');
const { isMultitenantEnabled, isMultitenantCrossed } = require('@config');
const { notNull, isEmail, isAlphaOrSpecial, setIsIn } = require('@config/validations.config');
const isIn = setIsIn(['admin', 'editor', 'viewer']);

const attributes = {
  username: { type: DataTypes.STRING, primaryKey: true, allowNull: false, unique: true, validate: { notNull } },
  password: { type: DataTypes.STRING, allowNull: false, validate: { notNull } },
  email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { notNull, isEmail } },
  name: { type: DataTypes.STRING, allowNull: false, validate: { notNull, isAlphaOrSpecial } },
  surnames: { type: DataTypes.STRING, allowNull: false, validate: { notNull, isAlphaOrSpecial } },
  role: { type: DataTypes.STRING, allowNull: false, validate: { notNull, isIn } }
};

if (isMultitenantEnabled && !isMultitenantCrossed) {
  attributes.tenantId = { type: DataTypes.STRING, allowNull: false, validate: { notNull } };
}

const options = {
  defaultScope: {
    attributes: { exclude: ['password'] },
  }
};

if (isMultitenantEnabled) {
  options.schema = 'admin';
}

const UsersModel = sequelize.define('user', attributes, options);

UsersModel.associate = function () {
  const model = modelName => this.sequelize.model(modelName);

  if (isMultitenantEnabled) {
    if (isMultitenantCrossed) {
      this.belongsToMany(model('tenant'), { through: model('userTenant') });
      console.debug('User belongs to many Tenants');
    } else {
      this.belongsTo(model('tenant'));
      console.debug('User belongs to Tenant');
    }
  }
};

module.exports = UsersModel;
