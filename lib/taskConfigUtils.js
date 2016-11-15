'use strict';

import _ from 'lodash';
import mongoose from 'mongoose';
import { getObjectFromSchema } from './utils';
import { _getTaskStatus } from './taskStateUtils';

const Schema = mongoose.Schema;

const configSchemaWithDefaults = {
  taskName: {
    type: String,
    default: '',
  },
  startedAt: {
    type: Date,
    default: new Date(),
  },
  shouldRun: {
    type: Boolean,
    default: false,
  },
};

export let _dbConn = new WeakMap();
let _taskConfigSchemas = new WeakMap();
let _taskConfigModels = new WeakMap();
let _taskConfigs = new WeakMap();

export const _getTaskConfigSchema = function _getTaskConfigSchema(taskName) {
  const self = this;
  let taskConfigSchemas = _taskConfigSchemas.get(self) || [];
  let taskConfigSchemaIndex = _.findIndex(taskConfigSchemas, function (schema){
    return schema.taskName.default === taskName;
  });
  if (taskConfigSchemaIndex === -1) {
    _setTaskConfigSchema.call(self, taskName, {});
    return _getTaskConfigSchema.call(self, taskName)
  } else {
    return taskConfigSchemas[taskConfigSchemaIndex];
  }
};

export const _setTaskConfig = function _setTaskConfig(taskConfig) {
  const self = this;
  let taskName = taskConfig.taskName;
  let taskConfigs = _taskConfigs.get(self) || [];
  let taskConfigIndex = _.findIndex(taskConfigs, { taskName: taskName });
  if (taskConfigIndex === -1) {
    taskConfigs.push(taskConfig)
  } else {
    taskConfigs[taskConfigIndex] = taskConfig;
  }
  _taskConfigs.set(self, taskConfigs);
};

export const _setTaskConfigSchema = function _setTaskConfigSchema(taskName, extendedConfigSchema) {
  const self = this;

  if (!_getTaskStatus.call(self, taskName)) {
    throw new Error(`${self.me}.setExtendedTaskConfigSchema: Task "${taskName}" is not registered`);
  }

  let taskConfigSchemas = _taskConfigSchemas.get(self) || [];
  let taskConfigSchemaIndex = _.findIndex(taskConfigSchemas, function (schema){
    return schema.taskName.default === taskName;
  });

  let newConfigSchema = {
    taskName: {
      type: String,
      default: taskName,
    },
  };
  newConfigSchema = _.merge({}, configSchemaWithDefaults, newConfigSchema, extendedConfigSchema);

  if (taskConfigSchemaIndex === -1) {
    taskConfigSchemas.push(newConfigSchema);
  } else {
    taskConfigSchemas[taskConfigSchemaIndex] = newConfigSchema;
  }

  _taskConfigSchemas.set(self, taskConfigSchemas);

  let defaultTaskConfig = getObjectFromSchema(newConfigSchema);
  defaultTaskConfig.hasBeenSavedtoDb = false;
  _setTaskConfig.call(self, defaultTaskConfig);
};

export const _getTaskConfigModels = function _getAllTaskConfigModels() {
  const self = this;
  return _taskConfigModels.get(self) && [];
};

export const _getTaskConfigModel = function _getConfigModel(taskName) {
  const self = this;

  let taskConfigModels = _taskConfigModels.get(self) || [];
  let taskConfigModel = _.find(taskConfigModels, { taskName: taskName });
  if (taskConfigModel) {
    return taskConfigModel.configModel;
  }

  const taskConfigSchema = _getTaskConfigSchema.call(self, taskName);
  if (!taskConfigSchema) {
    throw new Error(`${self.me}.getTaskConfigSchema: ConfigSchema not defined`);
  }
  
  let configMongooseSchema = new Schema(taskConfigSchema, { collection: `${self.me}.config` });
  if (!configMongooseSchema.hasOwnProperty('options')) configMongooseSchema.options = {};
  configMongooseSchema.options.toJSON = {
    transform: function (doc, ret, options) {
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  };
  let dbConn = _dbConn.get(self);
  let newTaskConfigModel = dbConn.model(`${self.me}.${taskName}`, configMongooseSchema);
  taskConfigModels.push(
    {
      taskName: taskName,
      configModel: newTaskConfigModel,
    });
  _taskConfigModels.set(self, taskConfigModels);
  return newTaskConfigModel;
};

export const _getTaskConfig = function _getTaskConfig(taskName) {
  const self = this;
  let taskConfigs = _taskConfigs.get(self);
  return _.find(taskConfigs, { taskName: taskName });
};

export const _saveTaskConfigToDatabase = function _saveTaskConfigToDatabase(taskConfig, callback) {
  let self = this;
  let log = self.log;

  let newTaskConfig = _.cloneDeep(taskConfig);
  newTaskConfig.hasBeenSavedtoDb = false;
  _setTaskConfig.call(self, newTaskConfig);

  if (_.isUndefined(_dbConn.get(self))) {
    _.isFunction(callback) && callback(null);
    return null;
  }

  let taskName = newTaskConfig.taskName;
  let TaskConfigModel = _getTaskConfigModel.call(self, taskName);

  TaskConfigModel.update({ taskName: taskName }, newTaskConfig, { multi: true, upsert: true, setDefaultsOnInsert: true }, function (err, rawResponse) {
    if (err) {
      log.warning(`${self.me}.saveConfigToDatabase: ${err.message}`);
    } else {
      log.info(`${self.me}.saveConfigToDatabase: Config saved to database`);
      taskConfig.hasBeenSavedtoDb = true;
      _setTaskConfig.call(self, taskConfig);
    }

    _.isFunction(callback) && callback(err);
  });
};
