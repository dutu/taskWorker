'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports._saveTaskConfigToDatabase = exports._getTaskConfig = exports._getTaskConfigModel = exports._setTaskConfigSchema = exports._setTaskConfig = exports._getTaskConfigSchema = exports._dbConn = undefined;

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _mongoose = require('mongoose');

var _mongoose2 = _interopRequireDefault(_mongoose);

var _utils = require('./utils');

var _taskStateUtils = require('./taskStateUtils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var Schema = _mongoose2.default.Schema;

var configSchemaWithDefaults = {
  taskName: {
    type: String,
    default: ''
  },
  startedAt: {
    type: Date,
    default: new Date()
  },
  shouldRun: {
    type: Boolean,
    default: false
  }
};

var _dbConn = exports._dbConn = new WeakMap();
var _taskConfigSchemas = new WeakMap();
var _taskConfigModels = new WeakMap();
var _taskConfigs = new WeakMap();

var _getTaskConfigSchema = exports._getTaskConfigSchema = function _getTaskConfigSchema(taskName) {
  var self = this;
  var taskConfigSchemas = _taskConfigSchemas.get(self) || [];
  var taskConfigSchemaIndex = _lodash2.default.findIndex(taskConfigSchemas, function (schema) {
    return schema.taskName.default === taskName;
  });
  if (taskConfigSchemaIndex === -1) {
    _setTaskConfigSchema.call(self, taskName, {});
    return _getTaskConfigSchema.call(self, taskName);
  } else {
    return taskConfigSchemas[taskConfigSchemaIndex];
  }
};

var _setTaskConfig = exports._setTaskConfig = function _setTaskConfig(taskConfig) {
  var self = this;
  var taskName = taskConfig.taskName;
  var taskConfigs = _taskConfigs.get(self) || [];
  var taskConfigIndex = _lodash2.default.findIndex(taskConfigs, { taskName: taskName });
  if (taskConfigIndex === -1) {
    taskConfigs.push(taskConfig);
  } else {
    taskConfigs[taskConfigIndex] = taskConfig;
  }
  _taskConfigs.set(self, taskConfigs);
};

var _setTaskConfigSchema = exports._setTaskConfigSchema = function _setTaskConfigSchema(taskName, extendedConfigSchema) {
  var self = this;

  if (!_taskStateUtils._getTaskStatus.call(self, taskName)) {
    throw new Error(self.me + '.setExtendedTaskConfigSchema: Task "' + taskName + '" is not registered');
  }

  var taskConfigSchemas = _taskConfigSchemas.get(self) || [];
  var taskConfigSchemaIndex = _lodash2.default.findIndex(taskConfigSchemas, function (schema) {
    return schema.taskName.default === taskName;
  });

  var newConfigSchema = {
    taskName: {
      type: String,
      default: taskName
    }
  };
  newConfigSchema = _lodash2.default.merge({}, configSchemaWithDefaults, newConfigSchema, extendedConfigSchema);

  if (taskConfigSchemaIndex === -1) {
    taskConfigSchemas.push(newConfigSchema);
  } else {
    taskConfigSchemas[taskConfigSchemaIndex] = newConfigSchema;
  }

  _taskConfigSchemas.set(self, taskConfigSchemas);

  var defaultTaskConfig = (0, _utils.getObjectFromSchema)(newConfigSchema);
  defaultTaskConfig.hasBeenSavedtoDb = false;
  _setTaskConfig.call(self, defaultTaskConfig);
};

var _getTaskConfigModel = exports._getTaskConfigModel = function _getConfigModel(taskName) {
  var self = this;

  var taskConfigModels = _taskConfigModels.get(self) || [];
  var taskConfigModel = _lodash2.default.find(taskConfigModels, { taskName: taskName });
  if (taskConfigModel) {
    return taskConfigModel.configModel;
  }

  var taskConfigSchema = _getTaskConfigSchema.call(self, taskName);
  if (!taskConfigSchema) {
    throw new Error(self.me + '.getTaskConfigSchema: ConfigSchema not defined');
  }

  var configMongooseSchema = new Schema(taskConfigSchema, { collection: self.me + '.config' });
  if (!configMongooseSchema.hasOwnProperty('options')) configMongooseSchema.options = {};
  configMongooseSchema.options.toJSON = {
    transform: function transform(doc, ret, options) {
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  };
  var dbConn = _dbConn.get(self);
  var newTaskConfigModel = dbConn.model(self.me + '.' + taskName, configMongooseSchema);
  taskConfigModels.push({
    taskName: taskName,
    configModel: newTaskConfigModel
  });
  _taskConfigModels.set(self, taskConfigModels);
  return newTaskConfigModel;
};

var _getTaskConfig = exports._getTaskConfig = function _getTaskConfig(taskName) {
  var self = this;
  var taskConfigs = _taskConfigs.get(self);
  return _lodash2.default.find(taskConfigs, { taskName: taskName });
};

var _saveTaskConfigToDatabase = exports._saveTaskConfigToDatabase = function _saveTaskConfigToDatabase(taskConfig, callback) {
  var self = this;
  var log = self.log;

  var newTaskConfig = _lodash2.default.cloneDeep(taskConfig);
  newTaskConfig.hasBeenSavedtoDb = false;
  _setTaskConfig.call(self, newTaskConfig);

  if (_lodash2.default.isUndefined(_dbConn.get(self))) {
    _lodash2.default.isFunction(callback) && callback(null);
    return null;
  }

  var taskName = newTaskConfig.taskName;
  var TaskConfigModel = _getTaskConfigModel.call(self, taskName);

  TaskConfigModel.update({ taskName: taskName }, newTaskConfig, { multi: true, upsert: true, setDefaultsOnInsert: true }, function (err, rawResponse) {
    if (err) {
      log.warning(self.me + '.' + taskName + '.saveConfigToDatabase: ' + err.message);
    } else {
      log.info(self.me + '.' + taskName + '.saveConfigToDatabase: Config saved to database');
      taskConfig.hasBeenSavedtoDb = true;
      _setTaskConfig.call(self, taskConfig);
    }

    _lodash2.default.isFunction(callback) && callback(err);
  });
};
//# sourceMappingURL=taskConfigUtils.js.map