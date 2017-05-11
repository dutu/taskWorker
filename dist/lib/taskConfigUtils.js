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
      log.warning(self.me + '.saveConfigToDatabase: ' + err.message);
    } else {
      log.info(self.me + '.saveConfigToDatabase: Config saved to database');
      taskConfig.hasBeenSavedtoDb = true;
      _setTaskConfig.call(self, taskConfig);
    }

    _lodash2.default.isFunction(callback) && callback(err);
  });
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9saWIvdGFza0NvbmZpZ1V0aWxzLmpzIl0sIm5hbWVzIjpbIlNjaGVtYSIsImNvbmZpZ1NjaGVtYVdpdGhEZWZhdWx0cyIsInRhc2tOYW1lIiwidHlwZSIsIlN0cmluZyIsImRlZmF1bHQiLCJzdGFydGVkQXQiLCJEYXRlIiwic2hvdWxkUnVuIiwiQm9vbGVhbiIsIl9kYkNvbm4iLCJXZWFrTWFwIiwiX3Rhc2tDb25maWdTY2hlbWFzIiwiX3Rhc2tDb25maWdNb2RlbHMiLCJfdGFza0NvbmZpZ3MiLCJfZ2V0VGFza0NvbmZpZ1NjaGVtYSIsInNlbGYiLCJ0YXNrQ29uZmlnU2NoZW1hcyIsImdldCIsInRhc2tDb25maWdTY2hlbWFJbmRleCIsImZpbmRJbmRleCIsInNjaGVtYSIsIl9zZXRUYXNrQ29uZmlnU2NoZW1hIiwiY2FsbCIsIl9zZXRUYXNrQ29uZmlnIiwidGFza0NvbmZpZyIsInRhc2tDb25maWdzIiwidGFza0NvbmZpZ0luZGV4IiwicHVzaCIsInNldCIsImV4dGVuZGVkQ29uZmlnU2NoZW1hIiwiRXJyb3IiLCJtZSIsIm5ld0NvbmZpZ1NjaGVtYSIsIm1lcmdlIiwiZGVmYXVsdFRhc2tDb25maWciLCJoYXNCZWVuU2F2ZWR0b0RiIiwiX2dldFRhc2tDb25maWdNb2RlbCIsIl9nZXRDb25maWdNb2RlbCIsInRhc2tDb25maWdNb2RlbHMiLCJ0YXNrQ29uZmlnTW9kZWwiLCJmaW5kIiwiY29uZmlnTW9kZWwiLCJ0YXNrQ29uZmlnU2NoZW1hIiwiY29uZmlnTW9uZ29vc2VTY2hlbWEiLCJjb2xsZWN0aW9uIiwiaGFzT3duUHJvcGVydHkiLCJvcHRpb25zIiwidG9KU09OIiwidHJhbnNmb3JtIiwiZG9jIiwicmV0IiwiX2lkIiwiX192IiwiZGJDb25uIiwibmV3VGFza0NvbmZpZ01vZGVsIiwibW9kZWwiLCJfZ2V0VGFza0NvbmZpZyIsIl9zYXZlVGFza0NvbmZpZ1RvRGF0YWJhc2UiLCJjYWxsYmFjayIsImxvZyIsIm5ld1Rhc2tDb25maWciLCJjbG9uZURlZXAiLCJpc1VuZGVmaW5lZCIsImlzRnVuY3Rpb24iLCJUYXNrQ29uZmlnTW9kZWwiLCJ1cGRhdGUiLCJtdWx0aSIsInVwc2VydCIsInNldERlZmF1bHRzT25JbnNlcnQiLCJlcnIiLCJyYXdSZXNwb25zZSIsIndhcm5pbmciLCJtZXNzYWdlIiwiaW5mbyJdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7QUFFQTs7OztBQUNBOzs7O0FBQ0E7O0FBQ0E7Ozs7QUFFQSxJQUFNQSxTQUFTLG1CQUFTQSxNQUF4Qjs7QUFFQSxJQUFNQywyQkFBMkI7QUFDL0JDLFlBQVU7QUFDUkMsVUFBTUMsTUFERTtBQUVSQyxhQUFTO0FBRkQsR0FEcUI7QUFLL0JDLGFBQVc7QUFDVEgsVUFBTUksSUFERztBQUVURixhQUFTLElBQUlFLElBQUo7QUFGQSxHQUxvQjtBQVMvQkMsYUFBVztBQUNUTCxVQUFNTSxPQURHO0FBRVRKLGFBQVM7QUFGQTtBQVRvQixDQUFqQzs7QUFlTyxJQUFJSyw0QkFBVSxJQUFJQyxPQUFKLEVBQWQ7QUFDUCxJQUFJQyxxQkFBcUIsSUFBSUQsT0FBSixFQUF6QjtBQUNBLElBQUlFLG9CQUFvQixJQUFJRixPQUFKLEVBQXhCO0FBQ0EsSUFBSUcsZUFBZSxJQUFJSCxPQUFKLEVBQW5COztBQUVPLElBQU1JLHNEQUF1QixTQUFTQSxvQkFBVCxDQUE4QmIsUUFBOUIsRUFBd0M7QUFDMUUsTUFBTWMsT0FBTyxJQUFiO0FBQ0EsTUFBSUMsb0JBQW9CTCxtQkFBbUJNLEdBQW5CLENBQXVCRixJQUF2QixLQUFnQyxFQUF4RDtBQUNBLE1BQUlHLHdCQUF3QixpQkFBRUMsU0FBRixDQUFZSCxpQkFBWixFQUErQixVQUFVSSxNQUFWLEVBQWlCO0FBQzFFLFdBQU9BLE9BQU9uQixRQUFQLENBQWdCRyxPQUFoQixLQUE0QkgsUUFBbkM7QUFDRCxHQUYyQixDQUE1QjtBQUdBLE1BQUlpQiwwQkFBMEIsQ0FBQyxDQUEvQixFQUFrQztBQUNoQ0cseUJBQXFCQyxJQUFyQixDQUEwQlAsSUFBMUIs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TSIsImZpbGUiOiJ0YXNrQ29uZmlnVXRpbHMuanMiLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCc7XG5cbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgbW9uZ29vc2UgZnJvbSAnbW9uZ29vc2UnO1xuaW1wb3J0IHsgZ2V0T2JqZWN0RnJvbVNjaGVtYSB9IGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IHsgX2dldFRhc2tTdGF0dXMgfSBmcm9tICcuL3Rhc2tTdGF0ZVV0aWxzJztcblxuY29uc3QgU2NoZW1hID0gbW9uZ29vc2UuU2NoZW1hO1xuXG5jb25zdCBjb25maWdTY2hlbWFXaXRoRGVmYXVsdHMgPSB7XG4gIHRhc2tOYW1lOiB7XG4gICAgdHlwZTogU3RyaW5nLFxuICAgIGRlZmF1bHQ6ICcnLFxuICB9LFxuICBzdGFydGVkQXQ6IHtcbiAgICB0eXBlOiBEYXRlLFxuICAgIGRlZmF1bHQ6IG5ldyBEYXRlKCksXG4gIH0sXG4gIHNob3VsZFJ1bjoge1xuICAgIHR5cGU6IEJvb2xlYW4sXG4gICAgZGVmYXVsdDogZmFsc2UsXG4gIH0sXG59O1xuXG5leHBvcnQgbGV0IF9kYkNvbm4gPSBuZXcgV2Vha01hcCgpO1xubGV0IF90YXNrQ29uZmlnU2NoZW1hcyA9IG5ldyBXZWFrTWFwKCk7XG5sZXQgX3Rhc2tDb25maWdNb2RlbHMgPSBuZXcgV2Vha01hcCgpO1xubGV0IF90YXNrQ29uZmlncyA9IG5ldyBXZWFrTWFwKCk7XG5cbmV4cG9ydCBjb25zdCBfZ2V0VGFza0NvbmZpZ1NjaGVtYSA9IGZ1bmN0aW9uIF9nZXRUYXNrQ29uZmlnU2NoZW1hKHRhc2tOYW1lKSB7XG4gIGNvbnN0IHNlbGYgPSB0aGlzO1xuICBsZXQgdGFza0NvbmZpZ1NjaGVtYXMgPSBfdGFza0NvbmZpZ1NjaGVtYXMuZ2V0KHNlbGYpIHx8IFtdO1xuICBsZXQgdGFza0NvbmZpZ1NjaGVtYUluZGV4ID0gXy5maW5kSW5kZXgodGFza0NvbmZpZ1NjaGVtYXMsIGZ1bmN0aW9uIChzY2hlbWEpe1xuICAgIHJldHVybiBzY2hlbWEudGFza05hbWUuZGVmYXVsdCA9PT0gdGFza05hbWU7XG4gIH0pO1xuICBpZiAodGFza0NvbmZpZ1NjaGVtYUluZGV4ID09PSAtMSkge1xuICAgIF9zZXRUYXNrQ29uZmlnU2NoZW1hLmNhbGwoc2VsZiwgdGFza05hbWUsIHt9KTtcbiAgICByZXR1cm4gX2dldFRhc2tDb25maWdTY2hlbWEuY2FsbChzZWxmLCB0YXNrTmFtZSlcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gdGFza0NvbmZpZ1NjaGVtYXNbdGFza0NvbmZpZ1NjaGVtYUluZGV4XTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IF9zZXRUYXNrQ29uZmlnID0gZnVuY3Rpb24gX3NldFRhc2tDb25maWcodGFza0NvbmZpZykge1xuICBjb25zdCBzZWxmID0gdGhpcztcbiAgbGV0IHRhc2tOYW1lID0gdGFza0NvbmZpZy50YXNrTmFtZTtcbiAgbGV0IHRhc2tDb25maWdzID0gX3Rhc2tDb25maWdzLmdldChzZWxmKSB8fCBbXTtcbiAgbGV0IHRhc2tDb25maWdJbmRleCA9IF8uZmluZEluZGV4KHRhc2tDb25maWdzLCB7IHRhc2tOYW1lOiB0YXNrTmFtZSB9KTtcbiAgaWYgKHRhc2tDb25maWdJbmRleCA9PT0gLTEpIHtcbiAgICB0YXNrQ29uZmlncy5wdXNoKHRhc2tDb25maWcpXG4gIH0gZWxzZSB7XG4gICAgdGFza0NvbmZpZ3NbdGFza0NvbmZpZ0luZGV4XSA9IHRhc2tDb25maWc7XG4gIH1cbiAgX3Rhc2tDb25maWdzLnNldChzZWxmLCB0YXNrQ29uZmlncyk7XG59O1xuXG5leHBvcnQgY29uc3QgX3NldFRhc2tDb25maWdTY2hlbWEgPSBmdW5jdGlvbiBfc2V0VGFza0NvbmZpZ1NjaGVtYSh0YXNrTmFtZSwgZXh0ZW5kZWRDb25maWdTY2hlbWEpIHtcbiAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgaWYgKCFfZ2V0VGFza1N0YXR1cy5jYWxsKHNlbGYsIHRhc2tOYW1lKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgJHtzZWxmLm1lfS5zZXRFeHRlbmRlZFRhc2tDb25maWdTY2hlbWE6IFRhc2sgXCIke3Rhc2tOYW1lfVwiIGlzIG5vdCByZWdpc3RlcmVkYCk7XG4gIH1cblxuICBsZXQgdGFza0NvbmZpZ1NjaGVtYXMgPSBfdGFza0NvbmZpZ1NjaGVtYXMuZ2V0KHNlbGYpIHx8IFtdO1xuICBsZXQgdGFza0NvbmZpZ1NjaGVtYUluZGV4ID0gXy5maW5kSW5kZXgodGFza0NvbmZpZ1NjaGVtYXMsIGZ1bmN0aW9uIChzY2hlbWEpe1xuICAgIHJldHVybiBzY2hlbWEudGFza05hbWUuZGVmYXVsdCA9PT0gdGFza05hbWU7XG4gIH0pO1xuXG4gIGxldCBuZXdDb25maWdTY2hlbWEgPSB7XG4gICAgdGFza05hbWU6IHtcbiAgICAgIHR5cGU6IFN0cmluZyxcbiAgICAgIGRlZmF1bHQ6IHRhc2tOYW1lLFxuICAgIH0sXG4gIH07XG4gIG5ld0NvbmZpZ1NjaGVtYSA9IF8ubWVyZ2Uoe30sIGNvbmZpZ1NjaGVtYVdpdGhEZWZhdWx0cywgbmV3Q29uZmlnU2NoZW1hLCBleHRlbmRlZENvbmZpZ1NjaGVtYSk7XG5cbiAgaWYgKHRhc2tDb25maWdTY2hlbWFJbmRleCA9PT0gLTEpIHtcbiAgICB0YXNrQ29uZmlnU2NoZW1hcy5wdXNoKG5ld0NvbmZpZ1NjaGVtYSk7XG4gIH0gZWxzZSB7XG4gICAgdGFza0NvbmZpZ1NjaGVtYXNbdGFza0NvbmZpZ1NjaGVtYUluZGV4XSA9IG5ld0NvbmZpZ1NjaGVtYTtcbiAgfVxuXG4gIF90YXNrQ29uZmlnU2NoZW1hcy5zZXQoc2VsZiwgdGFza0NvbmZpZ1NjaGVtYXMpO1xuXG4gIGxldCBkZWZhdWx0VGFza0NvbmZpZyA9IGdldE9iamVjdEZyb21TY2hlbWEobmV3Q29uZmlnU2NoZW1hKTtcbiAgZGVmYXVsdFRhc2tDb25maWcuaGFzQmVlblNhdmVkdG9EYiA9IGZhbHNlO1xuICBfc2V0VGFza0NvbmZpZy5jYWxsKHNlbGYsIGRlZmF1bHRUYXNrQ29uZmlnKTtcbn07XG5cbmV4cG9ydCBjb25zdCBfZ2V0VGFza0NvbmZpZ01vZGVsID0gZnVuY3Rpb24gX2dldENvbmZpZ01vZGVsKHRhc2tOYW1lKSB7XG4gIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gIGxldCB0YXNrQ29uZmlnTW9kZWxzID0gX3Rhc2tDb25maWdNb2RlbHMuZ2V0KHNlbGYpIHx8IFtdO1xuICBsZXQgdGFza0NvbmZpZ01vZGVsID0gXy5maW5kKHRhc2tDb25maWdNb2RlbHMsIHsgdGFza05hbWU6IHRhc2tOYW1lIH0pO1xuICBpZiAodGFza0NvbmZpZ01vZGVsKSB7XG4gICAgcmV0dXJuIHRhc2tDb25maWdNb2RlbC5jb25maWdNb2RlbDtcbiAgfVxuXG4gIGNvbnN0IHRhc2tDb25maWdTY2hlbWEgPSBfZ2V0VGFza0NvbmZpZ1NjaGVtYS5jYWxsKHNlbGYsIHRhc2tOYW1lKTtcbiAgaWYgKCF0YXNrQ29uZmlnU2NoZW1hKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGAke3NlbGYubWV9LmdldFRhc2tDb25maWdTY2hlbWE6IENvbmZpZ1NjaGVtYSBub3QgZGVmaW5lZGApO1xuICB9XG4gIFxuICBsZXQgY29uZmlnTW9uZ29vc2VTY2hlbWEgPSBuZXcgU2NoZW1hKHRhc2tDb25maWdTY2hlbWEsIHsgY29sbGVjdGlvbjogYCR7c2VsZi5tZX0uY29uZmlnYCB9KTtcbiAgaWYgKCFjb25maWdNb25nb29zZVNjaGVtYS5oYXNPd25Qcm9wZXJ0eSgnb3B0aW9ucycpKSBjb25maWdNb25nb29zZVNjaGVtYS5vcHRpb25zID0ge307XG4gIGNvbmZpZ01vbmdvb3NlU2NoZW1hLm9wdGlvbnMudG9KU09OID0ge1xuICAgIHRyYW5zZm9ybTogZnVuY3Rpb24gKGRvYywgcmV0LCBvcHRpb25zKSB7XG4gICAgICBkZWxldGUgcmV0Ll9pZDtcbiAgICAgIGRlbGV0ZSByZXQuX192O1xuICAgICAgcmV0dXJuIHJldDtcbiAgICB9LFxuICB9O1xuICBsZXQgZGJDb25uID0gX2RiQ29ubi5nZXQoc2VsZik7XG4gIGxldCBuZXdUYXNrQ29uZmlnTW9kZWwgPSBkYkNvbm4ubW9kZWwoYCR7c2VsZi5tZX0uJHt0YXNrTmFtZX1gLCBjb25maWdNb25nb29zZVNjaGVtYSk7XG4gIHRhc2tDb25maWdNb2RlbHMucHVzaChcbiAgICB7XG4gICAgICB0YXNrTmFtZTogdGFza05hbWUsXG4gICAgICBjb25maWdNb2RlbDogbmV3VGFza0NvbmZpZ01vZGVsLFxuICAgIH0pO1xuICBfdGFza0NvbmZpZ01vZGVscy5zZXQoc2VsZiwgdGFza0NvbmZpZ01vZGVscyk7XG4gIHJldHVybiBuZXdUYXNrQ29uZmlnTW9kZWw7XG59O1xuXG5leHBvcnQgY29uc3QgX2dldFRhc2tDb25maWcgPSBmdW5jdGlvbiBfZ2V0VGFza0NvbmZpZyh0YXNrTmFtZSkge1xuICBjb25zdCBzZWxmID0gdGhpcztcbiAgbGV0IHRhc2tDb25maWdzID0gX3Rhc2tDb25maWdzLmdldChzZWxmKTtcbiAgcmV0dXJuIF8uZmluZCh0YXNrQ29uZmlncywgeyB0YXNrTmFtZTogdGFza05hbWUgfSk7XG59O1xuXG5leHBvcnQgY29uc3QgX3NhdmVUYXNrQ29uZmlnVG9EYXRhYmFzZSA9IGZ1bmN0aW9uIF9zYXZlVGFza0NvbmZpZ1RvRGF0YWJhc2UodGFza0NvbmZpZywgY2FsbGJhY2spIHtcbiAgbGV0IHNlbGYgPSB0aGlzO1xuICBsZXQgbG9nID0gc2VsZi5sb2c7XG5cbiAgbGV0IG5ld1Rhc2tDb25maWcgPSBfLmNsb25lRGVlcCh0YXNrQ29uZmlnKTtcbiAgbmV3VGFza0NvbmZpZy5oYXNCZWVuU2F2ZWR0b0RiID0gZmFsc2U7XG4gIF9zZXRUYXNrQ29uZmlnLmNhbGwoc2VsZiwgbmV3VGFza0NvbmZpZyk7XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoX2RiQ29ubi5nZXQoc2VsZikpKSB7XG4gICAgXy5pc0Z1bmN0aW9uKGNhbGxiYWNrKSAmJiBjYWxsYmFjayhudWxsKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGxldCB0YXNrTmFtZSA9IG5ld1Rhc2tDb25maWcudGFza05hbWU7XG4gIGxldCBUYXNrQ29uZmlnTW9kZWwgPSBfZ2V0VGFza0NvbmZpZ01vZGVsLmNhbGwoc2VsZiwgdGFza05hbWUpO1xuXG4gIFRhc2tDb25maWdNb2RlbC51cGRhdGUoeyB0YXNrTmFtZTogdGFza05hbWUgfSwgbmV3VGFza0NvbmZpZywgeyBtdWx0aTogdHJ1ZSwgdXBzZXJ0OiB0cnVlLCBzZXREZWZhdWx0c09uSW5zZXJ0OiB0cnVlIH0sIGZ1bmN0aW9uIChlcnIsIHJhd1Jlc3BvbnNlKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgbG9nLndhcm5pbmcoYCR7c2VsZi5tZX0uc2F2ZUNvbmZpZ1RvRGF0YWJhc2U6ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxvZy5pbmZvKGAke3NlbGYubWV9LnNhdmVDb25maWdUb0RhdGFiYXNlOiBDb25maWcgc2F2ZWQgdG8gZGF0YWJhc2VgKTtcbiAgICAgIHRhc2tDb25maWcuaGFzQmVlblNhdmVkdG9EYiA9IHRydWU7XG4gICAgICBfc2V0VGFza0NvbmZpZy5jYWxsKHNlbGYsIHRhc2tDb25maWcpO1xuICAgIH1cblxuICAgIF8uaXNGdW5jdGlvbihjYWxsYmFjaykgJiYgY2FsbGJhY2soZXJyKTtcbiAgfSk7XG59O1xuIl19