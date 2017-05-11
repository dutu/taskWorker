'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TaskWorker = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _async = require('async');

var _mongoose = require('mongoose');

var _mongoose2 = _interopRequireDefault(_mongoose);

var _winston = require('winston');

var _winston2 = _interopRequireDefault(_winston);

var _eventEmitter = require('event-emitter');

var _eventEmitter2 = _interopRequireDefault(_eventEmitter);

var _utils = require('./lib/utils');

var _taskStateUtils = require('./lib/taskStateUtils');

var _taskConfigUtils = require('./lib/taskConfigUtils.js');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var emitter = (0, _eventEmitter2.default)({});
var _status = new WeakMap();
var _logger = new WeakMap();

var TaskWorker = exports.TaskWorker = function () {
  function TaskWorker(workerName) {
    _classCallCheck(this, TaskWorker);

    var self = this;
    self.me = workerName;

    var logger = new _winston2.default.Logger({
      transports: [new _winston2.default.transports.Console({
        colorize: true,
        level: 'debug'
      })]
    });
    logger.setLevels(_winston2.default.config.syslog.levels);
    _logger.set(self, logger);

    self.log = {};
    ['emerg', 'alert', 'crit', 'error', 'warning', 'notice', 'info', 'debug'].forEach(function (level) {
      self.log[level] = _lodash2.default.bind(logger[level], self);
    });

    _status.set(self, {
      worker: {
        restartedAt: new Date()
      }
    });
  }

  _createClass(TaskWorker, [{
    key: 'registerTask',
    value: function registerTask(taskName) {
      var self = this;

      if (!_lodash2.default.isFunction(self[taskName])) {
        throw new Error(self.me + '.registerTask: Task ' + taskName + ' is not a method of this object');
      }

      _taskStateUtils._registerTask.call(self, taskName);
      self.setExtendedTaskConfigSchema(taskName, {});
    }
  }, {
    key: 'runTask',
    value: function runTask(taskName, callbackAfterStopped) {
      var self = this;
      var getTaskStatus = _lodash2.default.bind(_taskStateUtils._getTaskStatus, self);
      var setTaskStatus = _lodash2.default.bind(_taskStateUtils._setTaskStatus, self);

      var taskStatus = getTaskStatus(taskName);
      if (_lodash2.default.isNull(taskStatus)) {
        throw new Error(self.me + '.runTask: Task ' + taskName + ' is not registered');
      }

      var taskFunction = _lodash2.default.bind(self[taskName], self);

      if (taskStatus.state === _taskStateUtils.taskSTATES.running || taskStatus.state === _taskStateUtils.taskSTATES.stopping) {
        return null;
      }

      if (taskStatus.state === _taskStateUtils.taskSTATES.delayed) {
        if (_lodash2.default.isFunction(taskStatus.next)) {
          clearTimeout(taskStatus.timeoutId);
          taskStatus.next();
          return null;
        } else {
          throw new Error(self.me + '.runTask: next is ' + taskStatus.next + ' (not a function)');
        }
      }

      var newTaskStatus = {
        taskName: taskName,
        state: _taskStateUtils.taskSTATES.running,
        lastRunAt: new Date(),
        delayedMS: null,
        timeoutId: null,
        next: null
      };
      setTaskStatus(newTaskStatus);

      self.changeTaskConfigParameters(taskName, { shouldRun: true });

      (0, _async.doWhilst)(function (callback) {
        var newTaskStatus = {
          taskName: taskName,
          state: _taskStateUtils.taskSTATES.running,
          lastRunAt: new Date(),
          delayedMS: null,
          timeoutId: null,
          next: null
        };
        setTaskStatus(newTaskStatus);
        // self.changeTaskConfigParameters(taskName, { shouldRun: true });

        taskFunction(function (delayMS) {
          var taskStatus = getTaskStatus(taskName);
          if (taskStatus.state === _taskStateUtils.taskSTATES.delayed || taskStatus.state === _taskStateUtils.taskSTATES.stopped) {
            throw new Error(self.me + '.runTask: Unexpected taskState["' + taskName + '"] = "' + taskStatus.state + '"');
          }

          if (!(_lodash2.default.isNumber(delayMS) || _lodash2.default.isNull(delayMS))) {
            throw new Error(self.me + '.' + taskName + ': next() called with wrong parameter type (' + (typeof delayMS === 'undefined' ? 'undefined' : _typeof(delayMS)) + ')');
          }

          if (_lodash2.default.isNumber(delayMS) && taskStatus.state === _taskStateUtils.taskSTATES.running) {
            var next = _lodash2.default.bind(callback, self);
            var _newTaskStatus = {
              taskName: taskName,
              state: _taskStateUtils.taskSTATES.delayed,
              lastRunAt: taskStatus.lastRunAt,
              delayedMS: delayMS,
              timeoutId: setTimeout(next, delayMS),
              next: _lodash2.default.bind(callback, this)
            };
            setTaskStatus(_newTaskStatus);
            //            self.changeTaskConfigParameters(taskName, { shouldRun: true });
          } else {
            var _newTaskStatus2 = {
              taskName: taskName,
              state: _taskStateUtils.taskSTATES.stopping,
              lastRunAt: taskStatus.lastRunAt,
              delayedMS: null,
              timeoutId: null,
              next: null
            };
            setTaskStatus(_newTaskStatus2);
            //            self.changeTaskConfigParameters(taskName, { shouldRun: false });
            callback();
          }
        });
      }, function () {
        var taskStatus = getTaskStatus(taskName);
        switch (taskStatus.state) {
          case _taskStateUtils.taskSTATES.delayed:
            return true;
          case _taskStateUtils.taskSTATES.stopping:
            return false;
          default:
            throw new Error(self.me + '.runTask: Unexpected taskState["' + taskName + '"] ' + taskStatus.state + ' )');
        }
      }, function (err, results) {
        if (err) {
          throw err;
        }

        var newTaskStatus = {
          taskName: taskName,
          state: _taskStateUtils.taskSTATES.stopped,
          lastRunAt: taskStatus.lastRunAt,
          delayedMS: null,
          timeoutId: null,
          next: null
        };
        setTaskStatus(newTaskStatus);
        //self.changeTaskConfigParameters(taskName, { shouldRun: false });

        if (_lodash2.default.isFunction(callbackAfterStopped)) {
          callbackAfterStopped.call(self);
        }
      });
    }
  }, {
    key: 'stopTask',
    value: function stopTask(taskName) {
      var self = this;
      var getTaskStatus = _lodash2.default.bind(_taskStateUtils._getTaskStatus, self);
      var setTaskStatus = _lodash2.default.bind(_taskStateUtils._setTaskStatus, self);

      var taskStatus = getTaskStatus(taskName);
      if (_lodash2.default.isNull(taskStatus)) {
        throw new Error(self.me + '.stopTask: Task ' + taskName + ' is not registered');
      }

      switch (taskStatus.state) {
        case _taskStateUtils.taskSTATES.stopped:
        case _taskStateUtils.taskSTATES.stopping:
          {
            self.changeTaskConfigParameters(taskName, { shouldRun: false });
            break;
          }
        case _taskStateUtils.taskSTATES.delayed:
          {
            clearTimeout(taskStatus.timeoutId);
            var newTaskStatus = {
              taskName: taskName,
              state: _taskStateUtils.taskSTATES.stopping,
              lastRunAt: taskStatus.lastRunAt,
              delayedMS: null,
              timeoutId: null,
              next: null
            };
            setTaskStatus(newTaskStatus);
            self.changeTaskConfigParameters(taskName, { shouldRun: false });
            taskStatus.next();
            break;
          }
        case _taskStateUtils.taskSTATES.running:
          {
            var _newTaskStatus3 = {
              taskName: taskName,
              state: _taskStateUtils.taskSTATES.stopping,
              lastRunAt: taskStatus.lastRunAt,
              delayedMS: taskStatus.delayedMS,
              timeoutId: taskStatus.timeoutId,
              next: taskStatus.next
            };
            setTaskStatus(_newTaskStatus3);
            self.changeTaskConfigParameters(taskName, { shouldRun: false });
            break;
          }
        default:
          {
            throw new Error(self.me + '.stopTask: Unrecognized task state ' + taskStatus.state);
          }
      }
    }
  }, {
    key: 'stopAllTasks',
    value: function stopAllTasks() {
      var self = this;
      var getAllTasksStatus = _lodash2.default.bind(_taskStateUtils._getAllTasksStatus, self);

      var allTasksStatus = getAllTasksStatus();

      allTasksStatus.forEach(function (task) {
        self.stopTask(task.taskName);
      });
    }
  }, {
    key: 'getStatus',
    value: function getStatus() {
      var self = this;

      var workerStatus = _status.get(self);

      var allTasksStatus = _taskStateUtils._getAllTasksStatus.call(self);
      var tasksStatus = {
        tasks: allTasksStatus.map(function (taskStatus) {
          var taskConfig = _taskConfigUtils._getTaskConfig.call(self, taskStatus.taskName);
          var result = {
            state: taskStatus.state,
            lastRunAt: taskStatus.lastRunAt,
            delayedMS: taskStatus.delayedMS
          };
          _lodash2.default.merge(result, taskConfig);
          return result;
        })
      };

      var dbConn = _taskConfigUtils._dbConn.get(self);
      var dbStatus = {
        dbConnection: {
          mongodbURI: dbConn && 'mongodb://' + dbConn.user + ':****@' + dbConn.host + ':' + dbConn.port + '/' + dbConn.name || '',
          state: dbConn && _mongoose2.default.Connection.STATES[dbConn._readyState] || null
        }
      };

      return _lodash2.default.merge({}, workerStatus, tasksStatus, dbStatus);
    }
  }, {
    key: 'addLoggerTransport',
    value: function addLoggerTransport(transport, options) {
      var self = this;

      var logger = _logger.get(self);
      logger.add(transport, options);
      _logger.set(self, logger);
    }
  }, {
    key: 'removeLoggerTransport',
    value: function removeLoggerTransport(transport) {
      var self = this;

      var logger = _logger.get(self);
      logger.remove(transport);
      _logger.set(self, logger);
    }
  }, {
    key: 'connectMongodb',
    value: function connectMongodb(mongoURI, callback) {
      var self = this;
      var log = self.log;

      if (!_lodash2.default.isFunction(callback)) {
        throw new Error(self.me + '.connectMongodb: Callback is not a function');
      }

      var dbConn = void 0;
      var options = { replset: { socketOptions: { connectTimeoutMS: 10000 } } };
      dbConn = _mongoose2.default.createConnection(mongoURI, options, function (err) {
        if (err) {
          log.error(self.me + '.dbConn: ' + err.message);
        } else {
          log.info(self.me + '.dbConn: Connection successful');
        }
        callback(err);
      });
      dbConn.on('error', function (err) {
        // any connection errors will be written to the console
        log.error(self.me + '.dbConn: ' + err.message);
      });

      _taskConfigUtils._dbConn.set(self, dbConn);

      self.registerTask('refreshTaskConfigsFromDb');

      var taskConfigSchema = {
        refreshIntervalMs: {
          type: Number,
          default: 1000
        }
      };
      self.setExtendedTaskConfigSchema('refreshTaskConfigsFromDb', taskConfigSchema);
      return dbConn;
    }
  }, {
    key: 'setExtendedTaskConfigSchema',
    value: function setExtendedTaskConfigSchema(taskName, configSchema) {
      _taskConfigUtils._setTaskConfigSchema.call(this, taskName, configSchema);
    }
  }, {
    key: 'changeTaskConfigParameters',
    value: function changeTaskConfigParameters(taskName) {
      var configParametersToChange = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var callback = arguments[2];

      var self = this;

      if (!_taskStateUtils._getTaskStatus.call(self, taskName)) {
        throw new Error(self.me + '.changeTaskConfigParameters: Task "' + taskName + '" is not registered');
      }

      if (configParametersToChange.hasOwnProperty('taskName')) {
        throw new Error(self.me + '.changeTaskConfigParameters: Cannot change "taskName"');
      }

      var configSchema = _taskConfigUtils._getTaskConfigSchema.call(self, taskName);
      if (!configSchema) {
        self.setExtendedTaskConfigSchema(taskName, {});
        configSchema = _taskConfigUtils._getTaskConfigSchema.call(self, taskName);
      }

      var existingTaskConfig = _taskConfigUtils._getTaskConfig.call(self, taskName);
      var newTaskConfig = _lodash2.default.merge({}, existingTaskConfig, configParametersToChange);
      newTaskConfig = (0, _utils.getObjectFromSchema)(configSchema, newTaskConfig);

      var changedParameters = (0, _utils.deepDiff)(existingTaskConfig, newTaskConfig);

      newTaskConfig.hasBeenSavedtoDb = existingTaskConfig.hasBeenSavedtoDb;
      if (_lodash2.default.isEqual(existingTaskConfig, newTaskConfig) && existingTaskConfig.hasBeenSavedtoDb) {
        _lodash2.default.isFunction(callback) && callback(null);
        return null;
      }

      newTaskConfig.hasBeenSavedtoDb = false;
      _taskConfigUtils._saveTaskConfigToDatabase.call(self, newTaskConfig, callback);

      var taskState = _taskStateUtils._getTaskStatus.call(self, taskName).state;

      if (changedParameters.shouldRun === true && (taskState === _taskStateUtils.taskSTATES.stopped || taskState === _taskStateUtils.taskSTATES.stopping)) {
        self.runTask(taskName);
      }

      if (changedParameters.shouldRun === false && (taskState === _taskStateUtils.taskSTATES.running || taskState === _taskStateUtils.taskSTATES.delayed)) {
        self.stopTask(taskName);
      }
    }
  }, {
    key: 'refreshTaskConfigsFromDb',
    value: function refreshTaskConfigsFromDb(next) {
      var self = this;
      var log = self.log;

      var tasks = self.getStatus().tasks;
      (0, _async.each)(tasks, function (task, callback) {
        var taskName = task.taskName;
        var ConfigModel = _taskConfigUtils._getTaskConfigModel.call(self, taskName);
        ConfigModel.findOne({ taskName: taskName }).lean().setOptions({ maxTimeMS: 10 }).exec(function (err, taskConfigFromDb) {
          if (err) {
            log.error(self.me + '.refreshTaskConfigsFromDb ' + err.message);
            return callback(null);
          }

          var taskConfig = _taskConfigUtils._getTaskConfig.call(self, taskName);
          if (taskConfigFromDb) {
            var newConfigParameters = _lodash2.default.cloneDeep(taskConfigFromDb);
            delete newConfigParameters.taskName;
            delete newConfigParameters._id;
            delete newConfigParameters.__v;
            delete newConfigParameters.$setOnInsert;
            self.changeTaskConfigParameters(taskName, newConfigParameters, callback);
          } else {
            _taskConfigUtils._saveTaskConfigToDatabase.call(self, taskConfig);
            callback();
          }
        });
      }, function (err) {
        var refreshIntervalMs = _taskConfigUtils._getTaskConfig.call(self, 'refreshTaskConfigsFromDb').refreshIntervalMs;
        next(refreshIntervalMs);
      });
    }
  }]);

  return TaskWorker;
}();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9pbmRleC5qcyJdLCJuYW1lcyI6WyJlbWl0dGVyIiwiX3N0YXR1cyIsIldlYWtNYXAiLCJfbG9nZ2VyIiwiVGFza1dvcmtlciIsIndvcmtlck5hbWUiLCJzZWxmIiwibWUiLCJsb2dnZXIiLCJMb2dnZXIiLCJ0cmFuc3BvcnRzIiwiQ29uc29sZSIsImNvbG9yaXplIiwibGV2ZWwiLCJzZXRMZXZlbHMiLCJjb25maWciLCJzeXNsb2ciLCJsZXZlbHMiLCJzZXQiLCJsb2ciLCJmb3JFYWNoIiwiYmluZCIsIndvcmtlciIsInJlc3RhcnRlZEF0IiwiRGF0ZSIsInRhc2tOYW1lIiwiaXNGdW5jdGlvbiIsIkVycm9yIiwiY2FsbCIsInNldEV4dGVuZGVkVGFza0NvbmZpZ1NjaGVtYSIsImNhbGxiYWNrQWZ0ZXJTdG9wcGVkIiwiZ2V0VGFza1N0YXR1cyIsInNldFRhc2tTdGF0dXMiLCJ0YXNrU3RhdHVzIiwiaXNOdWxsIiwidGFza0Z1bmN0aW9uIiwic3RhdGUiLCJydW5uaW5nIiwic3RvcHBpbmciLCJkZWxheWVkIiwibmV4dCIsImNsZWFyVGltZW91dCIsInRpbWVvdXRJZCIsIm5ld1Rhc2tTdGF0dXMiLCJsYXN0UnVuQXQiLCJkZWxheWVkTVMiLCJjaGFuZ2VUYXNrQ29uZmlnUGFyYW1ldGVycyIsInNob3VsZFJ1biIsImNhbGxiYWNrIiwiZGVsYXlNUyIsInN0b3BwZWQiLCJpc051bWJlciIsInNldFRpbWVvdXQiLCJlcnIiLCJyZXN1bHRzIiwiZ2V0QWxsVGFza3NTdGF0dXMiLCJhbGxUYXNrc1N0YXR1cyIsInN0b3BUYXNrIiwidGFzayIsIndvcmtlclN0YXR1cyIsImdldCIsInRhc2tzU3RhdHVzIiwidGFza3MiLCJtYXAiLCJ0YXNrQ29uZmlnIiwicmVzdWx0IiwibWVyZ2UiLCJkYkNvbm4iLCJkYlN0YXR1cyIsImRiQ29ubmVjdGlvbiIsIm1vbmdvZGJVUkkiLCJ1c2VyIiwiaG9zdCIsInBvcnQiLCJuYW1lIiwiQ29ubmVjdGlvbiIsIlNUQVRFUyIsIl9yZWFkeVN0YXRlIiwidHJhbnNwb3J0Iiwib3B0aW9ucyIsImFkZCIsInJlbW92ZSIsIm1vbmdvVVJJIiwicmVwbHNldCIsInNvY2tldE9wdGlvbnMiLCJjb25uZWN0VGltZW91dE1TIiwiY3JlYXRlQ29ubmVjdGlvbiIsImVycm9yIiwibWVzc2FnZSIsImluZm8iLCJvbiIsInJlZ2lzdGVyVGFzayIsInRhc2tDb25maWdTY2hlbWEiLCJyZWZyZXNoSW50ZXJ2YWxNcyIsInR5cGUiLCJOdW1iZXIiLCJkZWZhdWx0IiwiY29uZmlnU2NoZW1hIiwiY29uZmlnUGFyYW1ldGVyc1RvQ2hhbmdlIiwiaGFzT3duUHJvcGVydHkiLCJleGlzdGluZ1Rhc2tDb25maWciLCJuZXdUYXNrQ29uZmlnIiwiY2hhbmdlZFBhcmFtZXRlcnMiLCJoYXNCZWVuU2F2ZWR0b0RiIiwiaXNFcXVhbCIsInRhc2tTdGF0ZSIsInJ1blRhc2siLCJnZXRTdGF0dXMiLCJDb25maWdNb2RlbCIsImZpbmRPbmUiLCJsZWFuIiwic2V0T3B0aW9ucyIsIm1heFRpbWVNUyIsImV4ZWMiLCJ0YXNrQ29uZmlnRnJvbURiIiwibmV3Q29uZmlnUGFyYW1ldGVycyIsImNsb25lRGVlcCIsIl9pZCIsIl9fdiIsIiRzZXRPbkluc2VydCJdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7O0FBRUE7Ozs7QUFDQTs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7Ozs7QUFFQTs7QUFDQTs7QUFDQTs7Ozs7O0FBRUEsSUFBSUEsVUFBVSw0QkFBRyxFQUFILENBQWQ7QUFDQSxJQUFJQyxVQUFVLElBQUlDLE9BQUosRUFBZDtBQUNBLElBQUlDLFVBQVUsSUFBSUQsT0FBSixFQUFkOztJQUVhRSxVLFdBQUFBLFU7QUFDWCxzQkFBWUMsVUFBWixFQUF3QjtBQUFBOztBQUN0QixRQUFJQyxPQUFRLElBQVo7QUFDQUEsU0FBS0MsRUFBTCxHQUFVRixVQUFWOztBQUVBLFFBQUlHLFNBQVMsSUFBSyxrQkFBUUMsTUFBYixDQUFxQjtBQUNoQ0Msa0JBQVksQ0FD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QUFJZ0IsYUFBYSxnQ0FBZXBDLElBQWYsQ0FBb0J0QixJQUFwQixFQUEwQm1CLFFBQTFCLENBQWpCO0FBQ0EsY0FBSXlGLGdCQUFKLEVBQXNCO0FBQ3BCLGdCQUFJQyxzQkFBc0IsaUJBQUVDLFNBQUYsQ0FBWUYsZ0JBQVosQ0FBMUI7QUFDQSxtQkFBT0Msb0JBQW9CMUYsUUFBM0I7QUFDQSxtQkFBTzBGLG9CQUFvQkUsR0FBM0I7QUFDQSxtQkFBT0Ysb0JBQW9CRyxHQUEzQjtBQUNBLG1CQUFPSCxvQkFBb0JJLFlBQTNCO0FBQ0FqSCxpQkFBS3dDLDBCQUFMLENBQWdDckIsUUFBaEMsRUFBMEMwRixtQkFBMUMsRUFBK0RuRSxRQUEvRDtBQUNELFdBUEQsTUFPTztBQUNMLHVEQUEwQnBCLElBQTFCLENBQStCdEIsSUFBL0IsRUFBcUMwRCxVQUFyQztBQUNBaEI7QUFDRDtBQUNGLFNBbEJEO0FBbUJELE9BdkJILEVBd0JFLFVBQVVLLEdBQVYsRUFBYztBQUNaLFlBQUl3QyxvQkFBb0IsZ0NBQWVqRSxJQUFmLENBQW9CdEIsSUFBcEIsRUFBMEIsMEJBQTFCLEVBQXNEdUYsaUJBQTlFO0FBQ0FyRCxhQUFLcUQsaUJBQUw7QUFDRCxPQTNCSDtBQTRCRCIsImZpbGUiOiJpbmRleC5qcyIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcblxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCB7IGRvV2hpbHN0LCBlYWNoIH0gZnJvbSAnYXN5bmMnO1xuaW1wb3J0IG1vbmdvb3NlIGZyb20gJ21vbmdvb3NlJztcbmltcG9ydCB3aW5zdG9uIGZyb20gJ3dpbnN0b24nO1xuaW1wb3J0IGVlIGZyb20gJ2V2ZW50LWVtaXR0ZXInO1xuXG5pbXBvcnQgeyBnZXRPYmplY3RGcm9tU2NoZW1hLCBkZWVwRGlmZiB9IGZyb20gJy4vbGliL3V0aWxzJztcbmltcG9ydCB7IF9yZWdpc3RlclRhc2ssIF9nZXRUYXNrU3RhdHVzLCBfc2V0VGFza1N0YXR1cywgX2dldEFsbFRhc2tzU3RhdHVzLCB0YXNrU1RBVEVTIH0gZnJvbSAnLi9saWIvdGFza1N0YXRlVXRpbHMnO1xuaW1wb3J0IHsgX3NldFRhc2tDb25maWdTY2hlbWEsIF9nZXRUYXNrQ29uZmlnU2NoZW1hLCBfZ2V0VGFza0NvbmZpZ01vZGVsLCBfZ2V0VGFza0NvbmZpZywgX3NhdmVUYXNrQ29uZmlnVG9EYXRhYmFzZSwgX2RiQ29ubiB9IGZyb20gJy4vbGliL3Rhc2tDb25maWdVdGlscy5qcyc7XG5cbmxldCBlbWl0dGVyID0gZWUoe30pO1xubGV0IF9zdGF0dXMgPSBuZXcgV2Vha01hcCgpO1xubGV0IF9sb2dnZXIgPSBuZXcgV2Vha01hcCgpO1xuXG5leHBvcnQgY2xhc3MgVGFza1dvcmtlciB7XG4gIGNvbnN0cnVjdG9yKHdvcmtlck5hbWUpIHtcbiAgICBsZXQgc2VsZiAgPSB0aGlzO1xuICAgIHNlbGYubWUgPSB3b3JrZXJOYW1lO1xuXG4gICAgbGV0IGxvZ2dlciA9IG5ldyAod2luc3Rvbi5Mb2dnZXIpKHtcbiAgICAgIHRyYW5zcG9ydHM6IFtcbiAgICAgICAgbmV3ICh3aW5zdG9uLnRyYW5zcG9ydHMuQ29uc29sZSkoe1xuICAgICAgICAgIGNvbG9yaXplOiB0cnVlLFxuICAgICAgICAgIGxldmVsOiAnZGVidWcnLFxuICAgICAgICB9KVxuICAgICAgXSxcbiAgICB9KTtcbiAgICBsb2dnZXIuc2V0TGV2ZWxzKHdpbnN0b24uY29uZmlnLnN5c2xvZy5sZXZlbHMpO1xuICAgIF9sb2dnZXIuc2V0KHNlbGYsIGxvZ2dlcik7XG5cbiAgICBzZWxmLmxvZyA9IHt9O1xuICAgIFsnZW1lcmcnLCAnYWxlcnQnLCAnY3JpdCcsICdlcnJvcicsICd3YXJuaW5nJywgJ25vdGljZScsICdpbmZvJywgJ2RlYnVnJ10uZm9yRWFjaChsZXZlbCA9PiB7XG4gICAgICBzZWxmLmxvZ1tsZXZlbF0gPSBfLmJpbmQobG9nZ2VyW2xldmVsXSwgc2VsZik7XG4gICAgfSk7XG5cbiAgICBfc3RhdHVzLnNldChzZWxmLCB7XG4gICAgICB3b3JrZXI6IHtcbiAgICAgICAgcmVzdGFydGVkQXQ6IG5ldyBEYXRlKCksXG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbiAgcmVnaXN0ZXJUYXNrKHRhc2tOYW1lKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICBpZiAoIV8uaXNGdW5jdGlvbihzZWxmW3Rhc2tOYW1lXSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtzZWxmLm1lfS5yZWdpc3RlclRhc2s6IFRhc2sgJHt0YXNrTmFtZX0gaXMgbm90IGEgbWV0aG9kIG9mIHRoaXMgb2JqZWN0YCk7XG4gICAgfVxuXG4gICAgX3JlZ2lzdGVyVGFzay5jYWxsKHNlbGYsIHRhc2tOYW1lKTtcbiAgICBzZWxmLnNldEV4dGVuZGVkVGFza0NvbmZpZ1NjaGVtYSh0YXNrTmFtZSwge30pO1xuICB9XG5cbiAgcnVuVGFzayh0YXNrTmFtZSwgY2FsbGJhY2tBZnRlclN0b3BwZWQpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBjb25zdCBnZXRUYXNrU3RhdHVzID0gXy5iaW5kKF9nZXRUYXNrU3RhdHVzLCBzZWxmKTtcbiAgICBjb25zdCBzZXRUYXNrU3RhdHVzID0gXy5iaW5kKF9zZXRUYXNrU3RhdHVzLCBzZWxmKTtcblxuICAgIGxldCB0YXNrU3RhdHVzID0gZ2V0VGFza1N0YXR1cyh0YXNrTmFtZSk7XG4gICAgaWYoXy5pc051bGwodGFza1N0YXR1cykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtzZWxmLm1lfS5ydW5UYXNrOiBUYXNrICR7dGFza05hbWV9IGlzIG5vdCByZWdpc3RlcmVkYCk7XG4gICAgfVxuXG4gICAgY29uc3QgdGFza0Z1bmN0aW9uID0gXy5iaW5kKHNlbGZbdGFza05hbWVdLCBzZWxmKTtcblxuICAgIGlmICh0YXNrU3RhdHVzLnN0YXRlID09PSB0YXNrU1RBVEVTLnJ1bm5pbmcgfHwgdGFza1N0YXR1cy5zdGF0ZSA9PT0gdGFza1NUQVRFUy5zdG9wcGluZykge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgaWYgKHRhc2tTdGF0dXMuc3RhdGUgPT09IHRhc2tTVEFURVMuZGVsYXllZCkge1xuICAgICAgaWYgKF8uaXNGdW5jdGlvbih0YXNrU3RhdHVzLm5leHQpKSB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0YXNrU3RhdHVzLnRpbWVvdXRJZCk7XG4gICAgICAgIHRhc2tTdGF0dXMubmV4dCgpO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvciAoYCR7c2VsZi5tZX0ucnVuVGFzazogbmV4dCBpcyAke3Rhc2tTdGF0dXMubmV4dH0gKG5vdCBhIGZ1bmN0aW9uKWApXG4gICAgICB9XG4gICAgfVxuXG4gICAgbGV0IG5ld1Rhc2tTdGF0dXMgPSB7XG4gICAgICB0YXNrTmFtZTogdGFza05hbWUsXG4gICAgICBzdGF0ZTogdGFza1NUQVRFUy5ydW5uaW5nLFxuICAgICAgbGFzdFJ1bkF0OiBuZXcgRGF0ZSgpLFxuICAgICAgZGVsYXllZE1TOiBudWxsLFxuICAgICAgdGltZW91dElkOiBudWxsLFxuICAgICAgbmV4dDpudWxsLFxuICAgIH07XG4gICAgc2V0VGFza1N0YXR1cyhuZXdUYXNrU3RhdHVzKTtcblxuICAgIHNlbGYuY2hhbmdlVGFza0NvbmZpZ1BhcmFtZXRlcnModGFza05hbWUsIHsgc2hvdWxkUnVuOiB0cnVlIH0pO1xuXG4gICAgZG9XaGlsc3QoXG4gICAgICBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgICAgICBsZXQgbmV3VGFza1N0YXR1cyA9IHtcbiAgICAgICAgICB0YXNrTmFtZTogdGFza05hbWUsXG4gICAgICAgICAgc3RhdGU6IHRhc2tTVEFURVMucnVubmluZyxcbiAgICAgICAgICBsYXN0UnVuQXQ6IG5ldyBEYXRlKCksXG4gICAgICAgICAgZGVsYXllZE1TOiBudWxsLFxuICAgICAgICAgIHRpbWVvdXRJZDogbnVsbCxcbiAgICAgICAgICBuZXh0Om51bGwsXG4gICAgICAgIH07XG4gICAgICAgIHNldFRhc2tTdGF0dXMobmV3VGFza1N0YXR1cyk7XG4gICAgICAgIC8vIHNlbGYuY2hhbmdlVGFza0NvbmZpZ1BhcmFtZXRlcnModGFza05hbWUsIHsgc2hvdWxkUnVuOiB0cnVlIH0pO1xuXG4gICAgICAgIHRhc2tGdW5jdGlvbihmdW5jdGlvbihkZWxheU1TKSB7XG4gICAgICAgICAgbGV0IHRhc2tTdGF0dXMgPSBnZXRUYXNrU3RhdHVzKHRhc2tOYW1lKTtcbiAgICAgICAgICBpZiAodGFza1N0YXR1cy5zdGF0ZSA9PT0gdGFza1NUQVRFUy5kZWxheWVkIHx8IHRhc2tTdGF0dXMuc3RhdGUgPT09IHRhc2tTVEFURVMuc3RvcHBlZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yIChgJHtzZWxmLm1lfS5ydW5UYXNrOiBVbmV4cGVjdGVkIHRhc2tTdGF0ZVtcIiR7dGFza05hbWV9XCJdID0gXCIke3Rhc2tTdGF0dXMuc3RhdGV9XCJgKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmKCEoXy5pc051bWJlcihkZWxheU1TKSB8fCBfLmlzTnVsbChkZWxheU1TKSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvciAoYCR7c2VsZi5tZX0uJHt0YXNrTmFtZX06IG5leHQoKSBjYWxsZWQgd2l0aCB3cm9uZyBwYXJhbWV0ZXIgdHlwZSAoJHt0eXBlb2YgZGVsYXlNU30pYCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYoXy5pc051bWJlcihkZWxheU1TKSAmJiB0YXNrU3RhdHVzLnN0YXRlID09PSB0YXNrU1RBVEVTLnJ1bm5pbmcpIHtcbiAgICAgICAgICAgIGxldCBuZXh0ID0gXy5iaW5kKGNhbGxiYWNrLCBzZWxmKTtcbiAgICAgICAgICAgIGxldCBuZXdUYXNrU3RhdHVzID0ge1xuICAgICAgICAgICAgICB0YXNrTmFtZTogdGFza05hbWUsXG4gICAgICAgICAgICAgIHN0YXRlOiB0YXNrU1RBVEVTLmRlbGF5ZWQsXG4gICAgICAgICAgICAgIGxhc3RSdW5BdDogdGFza1N0YXR1cy5sYXN0UnVuQXQsXG4gICAgICAgICAgICAgIGRlbGF5ZWRNUzogZGVsYXlNUyxcbiAgICAgICAgICAgICAgdGltZW91dElkOiBzZXRUaW1lb3V0KG5leHQsIGRlbGF5TVMpLFxuICAgICAgICAgICAgICBuZXh0OiBfLmJpbmQoY2FsbGJhY2ssIHRoaXMpLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHNldFRhc2tTdGF0dXMobmV3VGFza1N0YXR1cyk7XG4vLyAgICAgICAgICAgIHNlbGYuY2hhbmdlVGFza0NvbmZpZ1BhcmFtZXRlcnModGFza05hbWUsIHsgc2hvdWxkUnVuOiB0cnVlIH0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgbmV3VGFza1N0YXR1cyA9IHtcbiAgICAgICAgICAgICAgdGFza05hbWU6IHRhc2tOYW1lLFxuICAgICAgICAgICAgICBzdGF0ZTogdGFza1NUQVRFUy5zdG9wcGluZyxcbiAgICAgICAgICAgICAgbGFzdFJ1bkF0OiB0YXNrU3RhdHVzLmxhc3RSdW5BdCxcbiAgICAgICAgICAgICAgZGVsYXllZE1TOiBudWxsLFxuICAgICAgICAgICAgICB0aW1lb3V0SWQ6IG51bGwsXG4gICAgICAgICAgICAgIG5leHQ6IG51bGwsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgc2V0VGFza1N0YXR1cyhuZXdUYXNrU3RhdHVzKTtcbi8vICAgICAgICAgICAgc2VsZi5jaGFuZ2VUYXNrQ29uZmlnUGFyYW1ldGVycyh0YXNrTmFtZSwgeyBzaG91bGRSdW46IGZhbHNlIH0pO1xuICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgZnVuY3Rpb24oKSB7XG4gICAgICAgIGxldCB0YXNrU3RhdHVzID0gZ2V0VGFza1N0YXR1cyh0YXNrTmFtZSk7XG4gICAgICAgIHN3aXRjaCh0YXNrU3RhdHVzLnN0YXRlKSB7XG4gICAgICAgICAgY2FzZSB0YXNrU1RBVEVTLmRlbGF5ZWQ6XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICBjYXNlIHRhc2tTVEFURVMuc3RvcHBpbmc6XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvciAoYCR7c2VsZi5tZX0ucnVuVGFzazogVW5leHBlY3RlZCB0YXNrU3RhdGVbXCIke3Rhc2tOYW1lfVwiXSAke3Rhc2tTdGF0dXMuc3RhdGV9IClgKVxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgZnVuY3Rpb24oZXJyLCByZXN1bHRzKSB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICB0aHJvdyAoZXJyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBuZXdUYXNrU3RhdHVzID0ge1xuICAgICAgICAgIHRhc2tOYW1lOiB0YXNrTmFtZSxcbiAgICAgICAgICBzdGF0ZTogdGFza1NUQVRFUy5zdG9wcGVkLFxuICAgICAgICAgIGxhc3RSdW5BdDogdGFza1N0YXR1cy5sYXN0UnVuQXQsXG4gICAgICAgICAgZGVsYXllZE1TOiBudWxsLFxuICAgICAgICAgIHRpbWVvdXRJZDogbnVsbCxcbiAgICAgICAgICBuZXh0OiBudWxsLFxuICAgICAgICB9O1xuICAgICAgICBzZXRUYXNrU3RhdHVzKG5ld1Rhc2tTdGF0dXMpO1xuICAgICAgICAvL3NlbGYuY2hhbmdlVGFza0NvbmZpZ1BhcmFtZXRlcnModGFza05hbWUsIHsgc2hvdWxkUnVuOiBmYWxzZSB9KTtcblxuICAgICAgICBpZiAoXy5pc0Z1bmN0aW9uKGNhbGxiYWNrQWZ0ZXJTdG9wcGVkKSkge1xuICAgICAgICAgIGNhbGxiYWNrQWZ0ZXJTdG9wcGVkLmNhbGwoc2VsZik7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgc3RvcFRhc2sodGFza05hbWUpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBjb25zdCBnZXRUYXNrU3RhdHVzID0gXy5iaW5kKF9nZXRUYXNrU3RhdHVzLCBzZWxmKTtcbiAgICBjb25zdCBzZXRUYXNrU3RhdHVzID0gXy5iaW5kKF9zZXRUYXNrU3RhdHVzLCBzZWxmKTtcblxuICAgIGxldCB0YXNrU3RhdHVzID0gZ2V0VGFza1N0YXR1cyh0YXNrTmFtZSk7XG4gICAgaWYoXy5pc051bGwodGFza1N0YXR1cykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtzZWxmLm1lfS5zdG9wVGFzazogVGFzayAke3Rhc2tOYW1lfSBpcyBub3QgcmVnaXN0ZXJlZGApO1xuICAgIH1cblxuICAgIHN3aXRjaCh0YXNrU3RhdHVzLnN0YXRlKSB7XG4gICAgICBjYXNlIHRhc2tTVEFURVMuc3RvcHBlZDpcbiAgICAgIGNhc2UgdGFza1NUQVRFUy5zdG9wcGluZzoge1xuICAgICAgICBzZWxmLmNoYW5nZVRhc2tDb25maWdQYXJhbWV0ZXJzKHRhc2tOYW1lLCB7IHNob3VsZFJ1bjogZmFsc2UgfSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSB0YXNrU1RBVEVTLmRlbGF5ZWQ6IHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRhc2tTdGF0dXMudGltZW91dElkKTtcbiAgICAgICAgbGV0IG5ld1Rhc2tTdGF0dXMgPSB7XG4gICAgICAgICAgdGFza05hbWU6IHRhc2tOYW1lLFxuICAgICAgICAgIHN0YXRlOiB0YXNrU1RBVEVTLnN0b3BwaW5nLFxuICAgICAgICAgIGxhc3RSdW5BdDogdGFza1N0YXR1cy5sYXN0UnVuQXQsXG4gICAgICAgICAgZGVsYXllZE1TOiBudWxsLFxuICAgICAgICAgIHRpbWVvdXRJZDogbnVsbCxcbiAgICAgICAgICBuZXh0OiBudWxsLFxuICAgICAgICB9O1xuICAgICAgICBzZXRUYXNrU3RhdHVzKG5ld1Rhc2tTdGF0dXMpO1xuICAgICAgICBzZWxmLmNoYW5nZVRhc2tDb25maWdQYXJhbWV0ZXJzKHRhc2tOYW1lLCB7IHNob3VsZFJ1bjogZmFsc2UgfSk7XG4gICAgICAgIHRhc2tTdGF0dXMubmV4dCgpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgdGFza1NUQVRFUy5ydW5uaW5nOiB7XG4gICAgICAgIGxldCBuZXdUYXNrU3RhdHVzID0ge1xuICAgICAgICAgIHRhc2tOYW1lOiB0YXNrTmFtZSxcbiAgICAgICAgICBzdGF0ZTogdGFza1NUQVRFUy5zdG9wcGluZyxcbiAgICAgICAgICBsYXN0UnVuQXQ6IHRhc2tTdGF0dXMubGFzdFJ1bkF0LFxuICAgICAgICAgIGRlbGF5ZWRNUzogdGFza1N0YXR1cy5kZWxheWVkTVMsXG4gICAgICAgICAgdGltZW91dElkOiB0YXNrU3RhdHVzLnRpbWVvdXRJZCxcbiAgICAgICAgICBuZXh0OiB0YXNrU3RhdHVzLm5leHQsXG4gICAgICAgIH07XG4gICAgICAgIHNldFRhc2tTdGF0dXMobmV3VGFza1N0YXR1cyk7XG4gICAgICAgIHNlbGYuY2hhbmdlVGFza0NvbmZpZ1BhcmFtZXRlcnModGFza05hbWUsIHsgc2hvdWxkUnVuOiBmYWxzZSB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBkZWZhdWx0OiB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgJHtzZWxmLm1lfS5zdG9wVGFzazogVW5yZWNvZ25pemVkIHRhc2sgc3RhdGUgJHt0YXNrU3RhdHVzLnN0YXRlfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0b3BBbGxUYXNrcygpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBjb25zdCBnZXRBbGxUYXNrc1N0YXR1cyA9IF8uYmluZChfZ2V0QWxsVGFza3NTdGF0dXMsIHNlbGYpO1xuXG5cbiAgICBjb25zdCBhbGxUYXNrc1N0YXR1cyA9IGdldEFsbFRhc2tzU3RhdHVzKCk7XG5cbiAgICBhbGxUYXNrc1N0YXR1cy5mb3JFYWNoKHRhc2sgPT4ge1xuICAgICAgc2VsZi5zdG9wVGFzayh0YXNrLnRhc2tOYW1lKTtcbiAgICB9KVxuICB9XG5cbiAgZ2V0U3RhdHVzKCkge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgbGV0IHdvcmtlclN0YXR1cyA9IF9zdGF0dXMuZ2V0KHNlbGYpO1xuXG4gICAgbGV0IGFsbFRhc2tzU3RhdHVzID0gX2dldEFsbFRhc2tzU3RhdHVzLmNhbGwoc2VsZik7XG4gICAgbGV0IHRhc2tzU3RhdHVzID0ge1xuICAgICAgdGFza3M6IGFsbFRhc2tzU3RhdHVzLm1hcCh0YXNrU3RhdHVzID0+IHtcbiAgICAgICAgbGV0IHRhc2tDb25maWcgPSBfZ2V0VGFza0NvbmZpZy5jYWxsKHNlbGYsIHRhc2tTdGF0dXMudGFza05hbWUpO1xuICAgICAgICBsZXQgcmVzdWx0ID0ge1xuICAgICAgICAgIHN0YXRlOiB0YXNrU3RhdHVzLnN0YXRlLFxuICAgICAgICAgIGxhc3RSdW5BdDogdGFza1N0YXR1cy5sYXN0UnVuQXQsXG4gICAgICAgICAgZGVsYXllZE1TOiB0YXNrU3RhdHVzLmRlbGF5ZWRNUyxcbiAgICAgICAgfTtcbiAgICAgICAgXy5tZXJnZShyZXN1bHQsIHRhc2tDb25maWcpO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfSksXG4gIH07XG5cbiAgICBsZXQgZGJDb25uID0gX2RiQ29ubi5nZXQoc2VsZik7XG4gICAgbGV0IGRiU3RhdHVzID0ge1xuICAgICAgZGJDb25uZWN0aW9uOiB7XG4gICAgICAgIG1vbmdvZGJVUkk6IGRiQ29ubiAmJiBgbW9uZ29kYjovLyR7ZGJDb25uLnVzZXJ9OioqKipAJHtkYkNvbm4uaG9zdH06JHtkYkNvbm4ucG9ydH0vJHtkYkNvbm4ubmFtZX1gIHx8ICcnLFxuICAgICAgICBzdGF0ZTogZGJDb25uICYmIG1vbmdvb3NlLkNvbm5lY3Rpb24uU1RBVEVTW2RiQ29ubi5fcmVhZHlTdGF0ZV0gfHwgbnVsbCxcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIF8ubWVyZ2Uoe30sIHdvcmtlclN0YXR1cywgdGFza3NTdGF0dXMsIGRiU3RhdHVzICk7XG4gIH1cblxuICBhZGRMb2dnZXJUcmFuc3BvcnQodHJhbnNwb3J0LCBvcHRpb25zKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICBsZXQgbG9nZ2VyID0gX2xvZ2dlci5nZXQoc2VsZik7XG4gICAgbG9nZ2VyLmFkZCh0cmFuc3BvcnQsIG9wdGlvbnMpO1xuICAgIF9sb2dnZXIuc2V0KHNlbGYsIGxvZ2dlcik7XG4gIH1cblxuICByZW1vdmVMb2dnZXJUcmFuc3BvcnQodHJhbnNwb3J0KSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICBsZXQgbG9nZ2VyID0gX2xvZ2dlci5nZXQoc2VsZik7XG4gICAgbG9nZ2VyLnJlbW92ZSh0cmFuc3BvcnQpO1xuICAgIF9sb2dnZXIuc2V0KHNlbGYsIGxvZ2dlcik7XG4gIH1cblxuICBjb25uZWN0TW9uZ29kYihtb25nb1VSSSwgY2FsbGJhY2spIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBsZXQgbG9nID0gc2VsZi5sb2c7XG5cbiAgICBpZiAoIV8uaXNGdW5jdGlvbihjYWxsYmFjaykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtzZWxmLm1lfS5jb25uZWN0TW9uZ29kYjogQ2FsbGJhY2sgaXMgbm90IGEgZnVuY3Rpb25gKVxuICAgIH1cblxuICAgIGxldCBkYkNvbm47XG4gICAgbGV0IG9wdGlvbnMgPSB7cmVwbHNldDoge3NvY2tldE9wdGlvbnM6IHtjb25uZWN0VGltZW91dE1TOiAxMDAwMH19fTtcbiAgICBkYkNvbm4gPSBtb25nb29zZS5jcmVhdGVDb25uZWN0aW9uKG1vbmdvVVJJLCBvcHRpb25zLCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIGxvZy5lcnJvcihgJHtzZWxmLm1lfS5kYkNvbm46ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2cuaW5mbyhgJHtzZWxmLm1lfS5kYkNvbm46IENvbm5lY3Rpb24gc3VjY2Vzc2Z1bGApO1xuICAgICAgfVxuICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICB9KTtcbiAgICBkYkNvbm4ub24oJ2Vycm9yJywgZnVuY3Rpb24gKGVycikgeyAgIC8vIGFueSBjb25uZWN0aW9uIGVycm9ycyB3aWxsIGJlIHdyaXR0ZW4gdG8gdGhlIGNvbnNvbGVcbiAgICAgIGxvZy5lcnJvcihgJHtzZWxmLm1lfS5kYkNvbm46ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gICAgfSk7XG5cbiAgICBfZGJDb25uLnNldChzZWxmLCBkYkNvbm4pO1xuXG4gICAgc2VsZi5yZWdpc3RlclRhc2soJ3JlZnJlc2hUYXNrQ29uZmlnc0Zyb21EYicpO1xuXG4gICAgY29uc3QgdGFza0NvbmZpZ1NjaGVtYSA9IHtcbiAgICAgIHJlZnJlc2hJbnRlcnZhbE1zOiB7XG4gICAgICAgIHR5cGU6IE51bWJlcixcbiAgICAgICAgZGVmYXVsdDogMTAwMCxcbiAgICAgIH1cbiAgICB9O1xuICAgIHNlbGYuc2V0RXh0ZW5kZWRUYXNrQ29uZmlnU2NoZW1hKCdyZWZyZXNoVGFza0NvbmZpZ3NGcm9tRGInLCB0YXNrQ29uZmlnU2NoZW1hKTtcbiAgICByZXR1cm4gZGJDb25uO1xuICB9XG5cbiAgc2V0RXh0ZW5kZWRUYXNrQ29uZmlnU2NoZW1hKHRhc2tOYW1lLCBjb25maWdTY2hlbWEpIHtcbiAgICBfc2V0VGFza0NvbmZpZ1NjaGVtYS5jYWxsKHRoaXMsIHRhc2tOYW1lLCBjb25maWdTY2hlbWEpO1xuICB9XG5cbiAgY2hhbmdlVGFza0NvbmZpZ1BhcmFtZXRlcnModGFza05hbWUsIGNvbmZpZ1BhcmFtZXRlcnNUb0NoYW5nZSA9IHt9LCBjYWxsYmFjaykge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgaWYgKCFfZ2V0VGFza1N0YXR1cy5jYWxsKHNlbGYsIHRhc2tOYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3NlbGYubWV9LmNoYW5nZVRhc2tDb25maWdQYXJhbWV0ZXJzOiBUYXNrIFwiJHt0YXNrTmFtZX1cIiBpcyBub3QgcmVnaXN0ZXJlZGApO1xuICAgIH1cblxuICAgIGlmIChjb25maWdQYXJhbWV0ZXJzVG9DaGFuZ2UuaGFzT3duUHJvcGVydHkoJ3Rhc2tOYW1lJykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtzZWxmLm1lfS5jaGFuZ2VUYXNrQ29uZmlnUGFyYW1ldGVyczogQ2Fubm90IGNoYW5nZSBcInRhc2tOYW1lXCJgKTtcbiAgICB9XG5cbiAgICBsZXQgY29uZmlnU2NoZW1hID0gX2dldFRhc2tDb25maWdTY2hlbWEuY2FsbChzZWxmLCB0YXNrTmFtZSk7XG4gICAgaWYgKCFjb25maWdTY2hlbWEpIHtcbiAgICAgIHNlbGYuc2V0RXh0ZW5kZWRUYXNrQ29uZmlnU2NoZW1hKHRhc2tOYW1lLCB7fSk7XG4gICAgICBjb25maWdTY2hlbWEgPSBfZ2V0VGFza0NvbmZpZ1NjaGVtYS5jYWxsKHNlbGYsIHRhc2tOYW1lKTtcbiAgICB9XG5cbiAgICBsZXQgZXhpc3RpbmdUYXNrQ29uZmlnID0gX2dldFRhc2tDb25maWcuY2FsbChzZWxmLCB0YXNrTmFtZSk7XG4gICAgbGV0IG5ld1Rhc2tDb25maWcgPSBfLm1lcmdlKHt9LCBleGlzdGluZ1Rhc2tDb25maWcsIGNvbmZpZ1BhcmFtZXRlcnNUb0NoYW5nZSk7XG4gICAgbmV3VGFza0NvbmZpZyA9IGdldE9iamVjdEZyb21TY2hlbWEoY29uZmlnU2NoZW1hLCBuZXdUYXNrQ29uZmlnKTtcblxuICAgIGxldCBjaGFuZ2VkUGFyYW1ldGVycyA9IGRlZXBEaWZmKGV4aXN0aW5nVGFza0NvbmZpZywgbmV3VGFza0NvbmZpZyk7XG5cbiAgICBuZXdUYXNrQ29uZmlnLmhhc0JlZW5TYXZlZHRvRGIgPSBleGlzdGluZ1Rhc2tDb25maWcuaGFzQmVlblNhdmVkdG9EYjtcbiAgICBpZiAoXy5pc0VxdWFsKGV4aXN0aW5nVGFza0NvbmZpZywgbmV3VGFza0NvbmZpZykgICYmIGV4aXN0aW5nVGFza0NvbmZpZy5oYXNCZWVuU2F2ZWR0b0RiKSAge1xuICAgICAgXy5pc0Z1bmN0aW9uKGNhbGxiYWNrKSAmJiBjYWxsYmFjayhudWxsKTtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIG5ld1Rhc2tDb25maWcuaGFzQmVlblNhdmVkdG9EYiA9IGZhbHNlO1xuICAgIF9zYXZlVGFza0NvbmZpZ1RvRGF0YWJhc2UuY2FsbChzZWxmLCBuZXdUYXNrQ29uZmlnLCBjYWxsYmFjayk7XG5cbiAgICBsZXQgdGFza1N0YXRlID0gX2dldFRhc2tTdGF0dXMuY2FsbChzZWxmLCB0YXNrTmFtZSkuc3RhdGU7XG5cbiAgICBpZiAoY2hhbmdlZFBhcmFtZXRlcnMuc2hvdWxkUnVuID09PSB0cnVlICYmICh0YXNrU3RhdGUgPT09IHRhc2tTVEFURVMuc3RvcHBlZCB8fCB0YXNrU3RhdGUgPT09IHRhc2tTVEFURVMuc3RvcHBpbmcpKSB7XG4gICAgICBzZWxmLnJ1blRhc2sodGFza05hbWUpO1xuICAgIH1cblxuICAgIGlmIChjaGFuZ2VkUGFyYW1ldGVycy5zaG91bGRSdW4gPT09IGZhbHNlICYmICh0YXNrU3RhdGUgPT09IHRhc2tTVEFURVMucnVubmluZyB8fCB0YXNrU3RhdGUgPT09IHRhc2tTVEFURVMuZGVsYXllZCkpIHtcbiAgICAgIHNlbGYuc3RvcFRhc2sodGFza05hbWUpO1xuICAgIH1cbiAgfVxuXG4gIHJlZnJlc2hUYXNrQ29uZmlnc0Zyb21EYihuZXh0KSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgbGV0IGxvZyA9IHNlbGYubG9nO1xuXG4gICAgbGV0IHRhc2tzID0gc2VsZi5nZXRTdGF0dXMoKS50YXNrcztcbiAgICBlYWNoKHRhc2tzLFxuICAgICAgZnVuY3Rpb24gKHRhc2ssIGNhbGxiYWNrKSB7XG4gICAgICAgIGxldCB0YXNrTmFtZSA9IHRhc2sudGFza05hbWU7XG4gICAgICAgIGxldCBDb25maWdNb2RlbCA9IF9nZXRUYXNrQ29uZmlnTW9kZWwuY2FsbChzZWxmLCB0YXNrTmFtZSk7XG4gICAgICAgIENvbmZpZ01vZGVsLmZpbmRPbmUoeyB0YXNrTmFtZTogdGFza05hbWUgfSkubGVhbigpLnNldE9wdGlvbnMoeyBtYXhUaW1lTVMgOiAxMCB9KS5leGVjKGZ1bmN0aW9uIChlcnIsIHRhc2tDb25maWdGcm9tRGIpIHtcbiAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICBsb2cuZXJyb3IoYCR7c2VsZi5tZX0ucmVmcmVzaFRhc2tDb25maWdzRnJvbURiICR7ZXJyLm1lc3NhZ2V9YCk7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2sobnVsbCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbGV0IHRhc2tDb25maWcgPSBfZ2V0VGFza0NvbmZpZy5jYWxsKHNlbGYsIHRhc2tOYW1lKTtcbiAgICAgICAgICBpZiAodGFza0NvbmZpZ0Zyb21EYikge1xuICAgICAgICAgICAgbGV0IG5ld0NvbmZpZ1BhcmFtZXRlcnMgPSBfLmNsb25lRGVlcCh0YXNrQ29uZmlnRnJvbURiKTtcbiAgICAgICAgICAgIGRlbGV0ZSBuZXdDb25maWdQYXJhbWV0ZXJzLnRhc2tOYW1lO1xuICAgICAgICAgICAgZGVsZXRlIG5ld0NvbmZpZ1BhcmFtZXRlcnMuX2lkO1xuICAgICAgICAgICAgZGVsZXRlIG5ld0NvbmZpZ1BhcmFtZXRlcnMuX192O1xuICAgICAgICAgICAgZGVsZXRlIG5ld0NvbmZpZ1BhcmFtZXRlcnMuJHNldE9uSW5zZXJ0O1xuICAgICAgICAgICAgc2VsZi5jaGFuZ2VUYXNrQ29uZmlnUGFyYW1ldGVycyh0YXNrTmFtZSwgbmV3Q29uZmlnUGFyYW1ldGVycywgY2FsbGJhY2spO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBfc2F2ZVRhc2tDb25maWdUb0RhdGFiYXNlLmNhbGwoc2VsZiwgdGFza0NvbmZpZyk7XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgICAgZnVuY3Rpb24gKGVycil7XG4gICAgICAgIGxldCByZWZyZXNoSW50ZXJ2YWxNcyA9IF9nZXRUYXNrQ29uZmlnLmNhbGwoc2VsZiwgJ3JlZnJlc2hUYXNrQ29uZmlnc0Zyb21EYicpLnJlZnJlc2hJbnRlcnZhbE1zO1xuICAgICAgICBuZXh0KHJlZnJlc2hJbnRlcnZhbE1zKTtcbiAgICAgIH0pO1xuICB9XG59XG4iXX0=