const { v4: uuidv4 } = require('uuid');

class Template {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.name = data.name;
    this.testType = data.testType;
    this.fields = data.fields || [];
    this.footerNotes = data.footerNotes;
    this.isActive = data.isActive !== undefined ? data.isActive : true;
    this.createdBy = data.createdBy;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  // Save to database
  async save() {
    this.updatedAt = new Date();
    const templates = global.db.getTemplates();
    const index = templates.findIndex(t => t.id === this.id);
    if (index >= 0) {
      templates[index] = this;
    } else {
      templates.push(this);
    }
    global.db.saveTemplates(templates);
    return this;
  }

  // Convert to JSON
  toJSON() {
    return { ...this };
  }

  // Static methods
  static async findById(id) {
    const templates = global.db.getTemplates();
    const template = templates.find(t => t.id === id);
    return template ? new Template(template) : null;
  }

  static async find(query = {}) {
    let templates = global.db.getTemplates();

    if (query.isActive !== undefined) {
      templates = templates.filter(t => t.isActive === query.isActive);
    }

    // Sorting
    templates.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return templates.map(t => new Template(t));
  }

  static async findOne(query) {
    const templates = await this.find(query);
    return templates[0] || null;
  }

  static async countDocuments(query = {}) {
    const templates = await this.find(query);
    return templates.length;
  }

  static async findOneAndUpdate(query, updateData, options = {}) {
    const templates = global.db.getTemplates();
    let template = null;

    if (query._id || query.id) {
      template = templates.find(t => t.id === (query._id || query.id));
    }

    if (template) {
      Object.assign(template, updateData, { updatedAt: new Date() });
      global.db.saveTemplates(templates);
      return options.new !== false ? new Template(template) : new Template(template);
    }

    return null;
  }

  static async findByIdAndUpdate(id, updateData, options = {}) {
    return await this.findOneAndUpdate({ id }, updateData, options);
  }

  static async findByIdAndDelete(id) {
    const templates = global.db.getTemplates();
    const index = templates.findIndex(t => t.id === id);
    if (index >= 0) {
      const deletedTemplate = templates.splice(index, 1)[0];
      global.db.saveTemplates(templates);
      return new Template(deletedTemplate);
    }
    return null;
  }
}

module.exports = Template;