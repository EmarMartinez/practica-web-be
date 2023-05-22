'use strict';

require('console-stamp')(console, {
  format: ':color:date(dd/mm/yy HH:MM:ss.l) :label\x1b[0m',
  tokens: {
    color: (props) => {
      const colors = {
        log: 32, // green
        info: 35, // magenta
        warn: 33, // yellow
        error: 31, // red
        debug: 36 // cyan
      };
      return `\x1b[${colors[props.method]}m`;
    }
  }
});
