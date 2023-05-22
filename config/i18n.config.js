'use strict';

const path = require('path');
const i18n = require('i18n');
const { locales, defaultLocale } = require('@config').i18n;

i18n.configure({
  locales,
  directory: path.join(__dirname, '../config/locales'),
  defaultLocale
});

module.exports = i18n;
