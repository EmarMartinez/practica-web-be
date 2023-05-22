'use strict';

const jwt = require('jsonwebtoken');
const { secret } = require('@config');

class JwtService {

  createToken(payload) {
    const token = jwt.sign(payload, secret, { expiresIn: '2 days' });
    return token;
  }

  verifyToken(token) {
    try {
      const payload = jwt.verify(token, secret);
      return payload;
    } catch (error) {
      console.error('JWT Service:', error.message);
      return undefined;
    }
  }
}

module.exports = new JwtService();
