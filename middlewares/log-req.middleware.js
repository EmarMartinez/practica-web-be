'use strict';

const logReqMiddleware = function (req, res, next) {
  try {
    console.log(`[REQ] ${req.method} ${req.originalUrl}`);
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = logReqMiddleware;
