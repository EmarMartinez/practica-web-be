'use strict';

// It is recommended to use date service methods only when equivalent
// operations with native Date object methods are to long and complex

// Documentation: https://date-fns.org/docs/Getting-Started
const { format, parse, add, sub, intervalToDuration, intlFormat, getDay } = require('date-fns');
const { es } = require('date-fns/locale');

class DateService {

  constructor() {
    this.locales = { es };
  }

  format(date, formatString, options = {}) {
    if (options.locale) options.locale = this.locales[options.locale];
    return format(date, formatString, options);
  }

  parse(dateString, formatString, referenceDate, options) {
    return parse(dateString, formatString, referenceDate, options);
  }

  add(date, duration) {
    return add(date, duration);
  }

  sub(date, duration) {
    return sub(date, duration);
  }

  intervalToDuration(startDate, endDate) {
    return intervalToDuration({ start: startDate, end: endDate });
  }

  intlFormat(argument, formatOptions, localeOptions) {
    return intlFormat(argument, formatOptions, localeOptions);
  }

  getDay(date) {
    return getDay(date);
  }

}

module.exports = new DateService();
