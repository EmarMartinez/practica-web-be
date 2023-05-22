'use strict';

// Valid tokens to use in validation error message templates:
// - {{field}}: table field name
// - {{args}}: validator arguments

const validationMsgs = {
  notNull: 'Field \'{{field}}\' cannot be null',
  isEmail: 'Field \'{{field}}\' must be an email',
  isInt: 'Field \'{{field}}\' must be an integer',
  isFloat: 'Field \'{{field}}\' must be a decimal number',
  isNumeric: 'Field \'{{field}}\' must be a number',
  isAlpha: 'Field \'{{field}}\' must only contain letters without special characters',
  isDate: 'Field \'{{field}}\' must be a date',
  isUUIDV4: { args: [4], msg: 'Field \'{{field}}\' must be UUIDV4' },
  isUUIDV1: { args: [1], msg: 'Field \'{{field}}\' must be UUIDV1' },
  isBoolean(value) {
    if (typeof value !== 'boolean') {
      throw new Error('Field \'{{field}}\' must be boolean');
    }
  },
  isAlphaOrSpecial(value) {
    const regexp = /^([A-Za-z\u00C0-\u00D6\u00D8-\u00f6\u00f8-\u00ff\s]*)$/g;
    if (!(regexp.test(value))) {
      throw new Error('Field \'{{field}}\' must only contain letters');
    }
  },
  setIsIn: list => {
    return { args: [list], msg: 'Field \'{{field}}\' must be one of these: {{args}}' };
  },
  setMax: max => {
    return { args: [max], msg: 'Field \'{{field}}\' must be lower than or equal to {{args}}' };
  },
  setMin: min => {
    return { args: [min], msg: 'Field \'{{field}}\' must be greater than or equal to {{args}}' };
  },
};

const sequelizeValidationMsgs = {};
for (const field in validationMsgs) {
  sequelizeValidationMsgs[field] = typeof validationMsgs[field] === 'string'
    ? { msg: validationMsgs[field] }
    : validationMsgs[field];
}

module.exports = sequelizeValidationMsgs;
