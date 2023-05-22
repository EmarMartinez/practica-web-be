'use strict';

const createError = require('http-errors');

class HttpErrorsService {

  create(status, message, properties) {
    return createError(status, message, properties);
  }

}

module.exports = new HttpErrorsService();
