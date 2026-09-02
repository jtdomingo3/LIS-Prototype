const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

class User {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.name = data.name;
    this.email = data.email;
    this.password = data.password;
    this.role = data.role || 'Receptionist';
    this.status = data.status || 'Active';
    this.licenseNumber = data.licenseNumber || null;
    this.signature = data.signature || null;
    // auto signature settings: { enabled: Boolean, until: ISOString|null }
    this.autoSignature = data.autoSignature || { enabled: false, until: null };
    this.permissions = data.permissions || {};
    this.createdAt = data.createdAt || new Date();
    this.lastLogin = data.lastLogin || null;
  }

  // Hash password before saving
  async hashPassword() {
    if (this.password && !/^\$2[aby]\$/.test(this.password)) {
      const salt = await bcrypt.genSalt(12);
      this.password = await bcrypt.hash(this.password, salt);
    }
  }

  // Compare password
  async comparePassword(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
  }

  // Convert to plain object (WITHOUT password — strictly safe for JSON responses, sessions, and views)
  toJSON() {
    const obj = { ...this };
    obj.autoSignature = this.autoSignature || { enabled: false, until: null };
    delete obj.password;
    return obj;
  }

  // Safe object for views/APIs
  toSafeJSON() {
    return this.toJSON();
  }

  // Complete object INCLUDING password (internal database persistence only)
  toRawObject() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      password: this.password,
      role: this.role,
      status: this.status,
      licenseNumber: this.licenseNumber,
      signature: this.signature,
      autoSignature: this.autoSignature || { enabled: false, until: null },
      permissions: this.permissions || {},
      createdAt: this.createdAt,
      lastLogin: this.lastLogin
    };
  }

  // Save to database
  async save() {
    await this.hashPassword();
    const users = global.db.getUsers();
    const index = users.findIndex(u => u.id === this.id);
    // Create a plain object for saving (avoid toJSON which removes password)
    const userData = {
      id: this.id,
      name: this.name,
      email: this.email,
      password: this.password,
      role: this.role,
      licenseNumber: this.licenseNumber,
      signature: this.signature,
      autoSignature: this.autoSignature,
      permissions: this.permissions,
      status: this.status,
      createdAt: this.createdAt,
      lastLogin: this.lastLogin
    };
    if (index >= 0) {
      users[index] = userData;
    } else {
      users.push(userData);
    }
    global.db.saveUsers(users);
    return this;
  }

  // Static methods
  static async findById(id) {
    if (!id) return null;
    if (global.db && typeof global.db.getUserById === 'function') {
      const user = global.db.getUserById(id);
      return user ? new User(user) : null;
    }
    const users = global.db.getUsers();
    const user = users.find(u => u.id === id);
    return user ? new User(user) : null;
  }

  static async findOne(query) {
    if (!query) return null;
    if (query.email && global.db && typeof global.db.getUserByEmail === 'function') {
      const user = global.db.getUserByEmail(query.email);
      return user ? new User(user) : null;
    }
    if ((query._id || query.id) && global.db && typeof global.db.getUserById === 'function') {
      const user = global.db.getUserById(query._id || query.id);
      return user ? new User(user) : null;
    }
    const users = global.db.getUsers();
    let user = null;

    if (query.email) {
      user = users.find(u => u.email === query.email);
    } else if (query._id || query.id) {
      user = users.find(u => u.id === (query._id || query.id));
    }

    return user ? new User(user) : null;
  }

  static async find(query = {}) {
    let users = global.db.getUsers();

    if (query.role) {
      users = users.filter(u => u.role === query.role);
    }

    return users.map(u => new User(u));
  }

  static async countDocuments(query = {}) {
    const users = await this.find(query);
    return users.length;
  }

  static async findOneAndUpdate(query, updateData, options = {}) {
    const users = global.db.getUsers();
    let user = null;

    if (query.email) {
      user = users.find(u => u.email === query.email);
    } else if (query._id || query.id) {
      user = users.find(u => u.id === (query._id || query.id));
    }

    if (user) {
      const existingPassword = user.password;
      Object.assign(user, updateData);
      if (updateData.password) {
        const salt = await bcrypt.genSalt(12);
        user.password = await bcrypt.hash(updateData.password, salt);
      } else if (!user.password && existingPassword) {
        user.password = existingPassword;
      }
      global.db.saveUsers(users);
      return options.new !== false ? new User(user) : new User(user);
    }

    return null;
  }

  static async findByIdAndUpdate(id, updateData, options = {}) {
    return await this.findOneAndUpdate({ id }, updateData, options);
  }

  static async findByIdAndDelete(id) {
    const users = global.db.getUsers();
    const index = users.findIndex(u => u.id === id);
    if (index >= 0) {
      const deletedUser = users.splice(index, 1)[0];
      global.db.saveUsers(users);
      return new User(deletedUser);
    }
    return null;
  }
}

module.exports = User;