const bcrypt = require('bcrypt');

class HashService {

  async hashString(string) {
    return bcrypt.hash(string, 10);
  }

  compareStrings(plainString, hashedString) {
    return bcrypt.compare(plainString, hashedString);
  }
}

module.exports = new HashService();
