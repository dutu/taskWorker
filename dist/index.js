'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

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

var TaskWorker = function () {
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

exports.default = TaskWorker;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9pbmRleC5qcyJdLCJuYW1lcyI6WyJlbWl0dGVyIiwiX3N0YXR1cyIsIldlYWtNYXAiLCJfbG9nZ2VyIiwiVGFza1dvcmtlciIsIndvcmtlck5hbWUiLCJzZWxmIiwibWUiLCJsb2dnZXIiLCJMb2dnZXIiLCJ0cmFuc3BvcnRzIiwiQ29uc29sZSIsImNvbG9yaXplIiwibGV2ZWwiLCJzZXRMZXZlbHMiLCJjb25maWciLCJzeXNsb2ciLCJsZXZlbHMiLCJzZXQiLCJsb2ciLCJmb3JFYWNoIiwiYmluZCIsIndvcmtlciIsInJlc3RhcnRlZEF0IiwiRGF0ZSIsInRhc2tOYW1lIiwiaXNGdW5jdGlvbiIsIkVycm9yIiwiY2FsbCIsInNldEV4dGVuZGVkVGFza0NvbmZpZ1NjaGVtYSIsImNhbGxiYWNrQWZ0ZXJTdG9wcGVkIiwiZ2V0VGFza1N0YXR1cyIsInNldFRhc2tTdGF0dXMiLCJ0YXNrU3RhdHVzIiwiaXNOdWxsIiwidGFza0Z1bmN0aW9uIiwic3RhdGUiLCJydW5uaW5nIiwic3RvcHBpbmciLCJkZWxheWVkIiwibmV4dCIsImNsZWFyVGltZW91dCIsInRpbWVvdXRJZCIsIm5ld1Rhc2tTdGF0dXMiLCJsYXN0UnVuQXQiLCJkZWxheWVkTVMiLCJjaGFuZ2VUYXNrQ29uZmlnUGFyYW1ldGVycyIsInNob3VsZFJ1biIsImNhbGxiYWNrIiwiZGVsYXlNUyIsInN0b3BwZWQiLCJpc051bWJlciIsInNldFRpbWVvdXQiLCJlcnIiLCJyZXN1bHRzIiwiZ2V0QWxsVGFza3NTdGF0dXMiLCJhbGxUYXNrc1N0YXR1cyIsInN0b3BUYXNrIiwidGFzayIsIndvcmtlclN0YXR1cyIsImdldCIsInRhc2tzU3RhdHVzIiwidGFza3MiLCJtYXAiLCJ0YXNrQ29uZmlnIiwicmVzdWx0IiwibWVyZ2UiLCJkYkNvbm4iLCJkYlN0YXR1cyIsImRiQ29ubmVjdGlvbiIsIm1vbmdvZGJVUkkiLCJ1c2VyIiwiaG9zdCIsInBvcnQiLCJuYW1lIiwiQ29ubmVjdGlvbiIsIlNUQVRFUyIsIl9yZWFkeVN0YXRlIiwidHJhbnNwb3J0Iiwib3B0aW9ucyIsImFkZCIsInJlbW92ZSIsIm1vbmdvVVJJIiwicmVwbHNldCIsInNvY2tldE9wdGlvbnMiLCJjb25uZWN0VGltZW91dE1TIiwiY3JlYXRlQ29ubmVjdGlvbiIsImVycm9yIiwibWVzc2FnZSIsImluZm8iLCJvbiIsInJlZ2lzdGVyVGFzayIsInRhc2tDb25maWdTY2hlbWEiLCJyZWZyZXNoSW50ZXJ2YWxNcyIsInR5cGUiLCJOdW1iZXIiLCJkZWZhdWx0IiwiY29uZmlnU2NoZW1hIiwiY29uZmlnUGFyYW1ldGVyc1RvQ2hhbmdlIiwiaGFzT3duUHJvcGVydHkiLCJleGlzdGluZ1Rhc2tDb25maWciLCJuZXdUYXNrQ29uZmlnIiwiY2hhbmdlZFBhcmFtZXRlcnMiLCJoYXNCZWVuU2F2ZWR0b0RiIiwiaXNFcXVhbCIsInRhc2tTdGF0ZSIsInJ1blRhc2siLCJnZXRTdGF0dXMiLCJDb25maWdNb2RlbCIsImZpbmRPbmUiLCJsZWFuIiwic2V0T3B0aW9ucyIsIm1heFRpbWVNUyIsImV4ZWMiLCJ0YXNrQ29uZmlnRnJvbURiIiwibmV3Q29uZmlnUGFyYW1ldGVycyIsImNsb25lRGVlcCIsIl9pZCIsIl9fdiIsIiRzZXRPbkluc2VydCJdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7QUFFQTs7OztBQUNBOztBQUNBOzs7O0FBQ0E7Ozs7QUFDQTs7OztBQUVBOztBQUNBOztBQUNBOzs7Ozs7QUFFQSxJQUFJQSxVQUFVLDRCQUFHLEVBQUgsQ0FBZDtBQUNBLElBQUlDLFVBQVUsSUFBSUMsT0FBSixFQUFkO0FBQ0EsSUFBSUMsVUFBVSxJQUFJRCxPQUFKLEVBQWQ7O0lBRXFCRSxVO0FBQ25CLHNCQUFZQyxVQUFaLEVBQXdCO0FBQUE7O0FBQ3RCLFFBQUlDLE9BQVEsSUFBWjtBQUNBQSxTQUFLQyxFQUFMLEdBQVVGLFVBQVY7O0FBRUEsUUFBSUcsU0FBUyxJQUFLLGtCQUFRQyxNQUFiLENBQXFCO0FBQ2hDQyxrQkFBWSxDQUNWLElBQUss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QUFhLGdDQUFlcEMsSUFBZixDQUFvQnRCLElBQXBCLEVBQTBCbUIsUUFBMUIsQ0FBakI7QUFDQSxjQUFJeUYsZ0JBQUosRUFBc0I7QUFDcEIsZ0JBQUlDLHNCQUFzQixpQkFBRUMsU0FBRixDQUFZRixnQkFBWixDQUExQjtBQUNBLG1CQUFPQyxvQkFBb0IxRixRQUEzQjtBQUNBLG1CQUFPMEYsb0JBQW9CRSxHQUEzQjtBQUNBLG1CQUFPRixvQkFBb0JHLEdBQTNCO0FBQ0EsbUJBQU9ILG9CQUFvQkksWUFBM0I7QUFDQWpILGlCQUFLd0MsMEJBQUwsQ0FBZ0NyQixRQUFoQyxFQUEwQzBGLG1CQUExQyxFQUErRG5FLFFBQS9EO0FBQ0QsV0FQRCxNQU9PO0FBQ0wsdURBQTBCcEIsSUFBMUIsQ0FBK0J0QixJQUEvQixFQUFxQzBELFVBQXJDO0FBQ0FoQjtBQUNEO0FBQ0YsU0FsQkQ7QUFtQkQsT0F2QkgsRUF3QkUsVUFBVUssR0FBVixFQUFjO0FBQ1osWUFBSXdDLG9CQUFvQixnQ0FBZWpFLElBQWYsQ0FBb0J0QixJQUFwQixFQUEwQiwwQkFBMUIsRUFBc0R1RixpQkFBOUU7QUFDQXJELGFBQUtxRCxpQkFBTDtBQUNELE9BM0JIO0FBNEJEOzs7Ozs7a0JBallrQnpGLFUiLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCc7XG5cbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgeyBkb1doaWxzdCwgZWFjaCB9IGZyb20gJ2FzeW5jJztcbmltcG9ydCBtb25nb29zZSBmcm9tICdtb25nb29zZSc7XG5pbXBvcnQgd2luc3RvbiBmcm9tICd3aW5zdG9uJztcbmltcG9ydCBlZSBmcm9tICdldmVudC1lbWl0dGVyJztcblxuaW1wb3J0IHsgZ2V0T2JqZWN0RnJvbVNjaGVtYSwgZGVlcERpZmYgfSBmcm9tICcuL2xpYi91dGlscyc7XG5pbXBvcnQgeyBfcmVnaXN0ZXJUYXNrLCBfZ2V0VGFza1N0YXR1cywgX3NldFRhc2tTdGF0dXMsIF9nZXRBbGxUYXNrc1N0YXR1cywgdGFza1NUQVRFUyB9IGZyb20gJy4vbGliL3Rhc2tTdGF0ZVV0aWxzJztcbmltcG9ydCB7IF9zZXRUYXNrQ29uZmlnU2NoZW1hLCBfZ2V0VGFza0NvbmZpZ1NjaGVtYSwgX2dldFRhc2tDb25maWdNb2RlbCwgX2dldFRhc2tDb25maWcsIF9zYXZlVGFza0NvbmZpZ1RvRGF0YWJhc2UsIF9kYkNvbm4gfSBmcm9tICcuL2xpYi90YXNrQ29uZmlnVXRpbHMuanMnO1xuXG5sZXQgZW1pdHRlciA9IGVlKHt9KTtcbmxldCBfc3RhdHVzID0gbmV3IFdlYWtNYXAoKTtcbmxldCBfbG9nZ2VyID0gbmV3IFdlYWtNYXAoKTtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgVGFza1dvcmtlciB7XG4gIGNvbnN0cnVjdG9yKHdvcmtlck5hbWUpIHtcbiAgICBsZXQgc2VsZiAgPSB0aGlzO1xuICAgIHNlbGYubWUgPSB3b3JrZXJOYW1lO1xuXG4gICAgbGV0IGxvZ2dlciA9IG5ldyAod2luc3Rvbi5Mb2dnZXIpKHtcbiAgICAgIHRyYW5zcG9ydHM6IFtcbiAgICAgICAgbmV3ICh3aW5zdG9uLnRyYW5zcG9ydHMuQ29uc29sZSkoe1xuICAgICAgICAgIGNvbG9yaXplOiB0cnVlLFxuICAgICAgICAgIGxldmVsOiAnZGVidWcnLFxuICAgICAgICB9KVxuICAgICAgXSxcbiAgICB9KTtcbiAgICBsb2dnZXIuc2V0TGV2ZWxzKHdpbnN0b24uY29uZmlnLnN5c2xvZy5sZXZlbHMpO1xuICAgIF9sb2dnZXIuc2V0KHNlbGYsIGxvZ2dlcik7XG5cbiAgICBzZWxmLmxvZyA9IHt9O1xuICAgIFsnZW1lcmcnLCAnYWxlcnQnLCAnY3JpdCcsICdlcnJvcicsICd3YXJuaW5nJywgJ25vdGljZScsICdpbmZvJywgJ2RlYnVnJ10uZm9yRWFjaChsZXZlbCA9PiB7XG4gICAgICBzZWxmLmxvZ1tsZXZlbF0gPSBfLmJpbmQobG9nZ2VyW2xldmVsXSwgc2VsZik7XG4gICAgfSk7XG5cbiAgICBfc3RhdHVzLnNldChzZWxmLCB7XG4gICAgICB3b3JrZXI6IHtcbiAgICAgICAgcmVzdGFydGVkQXQ6IG5ldyBEYXRlKCksXG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbiAgcmVnaXN0ZXJUYXNrKHRhc2tOYW1lKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICBpZiAoIV8uaXNGdW5jdGlvbihzZWxmW3Rhc2tOYW1lXSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtzZWxmLm1lfS5yZWdpc3RlclRhc2s6IFRhc2sgJHt0YXNrTmFtZX0gaXMgbm90IGEgbWV0aG9kIG9mIHRoaXMgb2JqZWN0YCk7XG4gICAgfVxuXG4gICAgX3JlZ2lzdGVyVGFzay5jYWxsKHNlbGYsIHRhc2tOYW1lKTtcbiAgICBzZWxmLnNldEV4dGVuZGVkVGFza0NvbmZpZ1NjaGVtYSh0YXNrTmFtZSwge30pO1xuICB9XG5cbiAgcnVuVGFzayh0YXNrTmFtZSwgY2FsbGJhY2tBZnRlclN0b3BwZWQpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBjb25zdCBnZXRUYXNrU3RhdHVzID0gXy5iaW5kKF9nZXRUYXNrU3RhdHVzLCBzZWxmKTtcbiAgICBjb25zdCBzZXRUYXNrU3RhdHVzID0gXy5iaW5kKF9zZXRUYXNrU3RhdHVzLCBzZWxmKTtcblxuICAgIGxldCB0YXNrU3RhdHVzID0gZ2V0VGFza1N0YXR1cyh0YXNrTmFtZSk7XG4gICAgaWYoXy5pc051bGwodGFza1N0YXR1cykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtzZWxmLm1lfS5ydW5UYXNrOiBUYXNrICR7dGFza05hbWV9IGlzIG5vdCByZWdpc3RlcmVkYCk7XG4gICAgfVxuXG4gICAgY29uc3QgdGFza0Z1bmN0aW9uID0gXy5iaW5kKHNlbGZbdGFza05hbWVdLCBzZWxmKTtcblxuICAgIGlmICh0YXNrU3RhdHVzLnN0YXRlID09PSB0YXNrU1RBVEVTLnJ1bm5pbmcgfHwgdGFza1N0YXR1cy5zdGF0ZSA9PT0gdGFza1NUQVRFUy5zdG9wcGluZykge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgaWYgKHRhc2tTdGF0dXMuc3RhdGUgPT09IHRhc2tTVEFURVMuZGVsYXllZCkge1xuICAgICAgaWYgKF8uaXNGdW5jdGlvbih0YXNrU3RhdHVzLm5leHQpKSB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0YXNrU3RhdHVzLnRpbWVvdXRJZCk7XG4gICAgICAgIHRhc2tTdGF0dXMubmV4dCgpO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvciAoYCR7c2VsZi5tZX0ucnVuVGFzazogbmV4dCBpcyAke3Rhc2tTdGF0dXMubmV4dH0gKG5vdCBhIGZ1bmN0aW9uKWApXG4gICAgICB9XG4gICAgfVxuXG4gICAgbGV0IG5ld1Rhc2tTdGF0dXMgPSB7XG4gICAgICB0YXNrTmFtZTogdGFza05hbWUsXG4gICAgICBzdGF0ZTogdGFza1NUQVRFUy5ydW5uaW5nLFxuICAgICAgbGFzdFJ1bkF0OiBuZXcgRGF0ZSgpLFxuICAgICAgZGVsYXllZE1TOiBudWxsLFxuICAgICAgdGltZW91dElkOiBudWxsLFxuICAgICAgbmV4dDpudWxsLFxuICAgIH07XG4gICAgc2V0VGFza1N0YXR1cyhuZXdUYXNrU3RhdHVzKTtcblxuICAgIHNlbGYuY2hhbmdlVGFza0NvbmZpZ1BhcmFtZXRlcnModGFza05hbWUsIHsgc2hvdWxkUnVuOiB0cnVlIH0pO1xuXG4gICAgZG9XaGlsc3QoXG4gICAgICBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgICAgICBsZXQgbmV3VGFza1N0YXR1cyA9IHtcbiAgICAgICAgICB0YXNrTmFtZTogdGFza05hbWUsXG4gICAgICAgICAgc3RhdGU6IHRhc2tTVEFURVMucnVubmluZyxcbiAgICAgICAgICBsYXN0UnVuQXQ6IG5ldyBEYXRlKCksXG4gICAgICAgICAgZGVsYXllZE1TOiBudWxsLFxuICAgICAgICAgIHRpbWVvdXRJZDogbnVsbCxcbiAgICAgICAgICBuZXh0Om51bGwsXG4gICAgICAgIH07XG4gICAgICAgIHNldFRhc2tTdGF0dXMobmV3VGFza1N0YXR1cyk7XG4gICAgICAgIC8vIHNlbGYuY2hhbmdlVGFza0NvbmZpZ1BhcmFtZXRlcnModGFza05hbWUsIHsgc2hvdWxkUnVuOiB0cnVlIH0pO1xuXG4gICAgICAgIHRhc2tGdW5jdGlvbihmdW5jdGlvbihkZWxheU1TKSB7XG4gICAgICAgICAgbGV0IHRhc2tTdGF0dXMgPSBnZXRUYXNrU3RhdHVzKHRhc2tOYW1lKTtcbiAgICAgICAgICBpZiAodGFza1N0YXR1cy5zdGF0ZSA9PT0gdGFza1NUQVRFUy5kZWxheWVkIHx8IHRhc2tTdGF0dXMuc3RhdGUgPT09IHRhc2tTVEFURVMuc3RvcHBlZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yIChgJHtzZWxmLm1lfS5ydW5UYXNrOiBVbmV4cGVjdGVkIHRhc2tTdGF0ZVtcIiR7dGFza05hbWV9XCJdID0gXCIke3Rhc2tTdGF0dXMuc3RhdGV9XCJgKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmKCEoXy5pc051bWJlcihkZWxheU1TKSB8fCBfLmlzTnVsbChkZWxheU1TKSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvciAoYCR7c2VsZi5tZX0uJHt0YXNrTmFtZX06IG5leHQoKSBjYWxsZWQgd2l0aCB3cm9uZyBwYXJhbWV0ZXIgdHlwZSAoJHt0eXBlb2YgZGVsYXlNU30pYCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYoXy5pc051bWJlcihkZWxheU1TKSAmJiB0YXNrU3RhdHVzLnN0YXRlID09PSB0YXNrU1RBVEVTLnJ1bm5pbmcpIHtcbiAgICAgICAgICAgIGxldCBuZXh0ID0gXy5iaW5kKGNhbGxiYWNrLCBzZWxmKTtcbiAgICAgICAgICAgIGxldCBuZXdUYXNrU3RhdHVzID0ge1xuICAgICAgICAgICAgICB0YXNrTmFtZTogdGFza05hbWUsXG4gICAgICAgICAgICAgIHN0YXRlOiB0YXNrU1RBVEVTLmRlbGF5ZWQsXG4gICAgICAgICAgICAgIGxhc3RSdW5BdDogdGFza1N0YXR1cy5sYXN0UnVuQXQsXG4gICAgICAgICAgICAgIGRlbGF5ZWRNUzogZGVsYXlNUyxcbiAgICAgICAgICAgICAgdGltZW91dElkOiBzZXRUaW1lb3V0KG5leHQsIGRlbGF5TVMpLFxuICAgICAgICAgICAgICBuZXh0OiBfLmJpbmQoY2FsbGJhY2ssIHRoaXMpLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHNldFRhc2tTdGF0dXMobmV3VGFza1N0YXR1cyk7XG4vLyAgICAgICAgICAgIHNlbGYuY2hhbmdlVGFza0NvbmZpZ1BhcmFtZXRlcnModGFza05hbWUsIHsgc2hvdWxkUnVuOiB0cnVlIH0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgbmV3VGFza1N0YXR1cyA9IHtcbiAgICAgICAgICAgICAgdGFza05hbWU6IHRhc2tOYW1lLFxuICAgICAgICAgICAgICBzdGF0ZTogdGFza1NUQVRFUy5zdG9wcGluZyxcbiAgICAgICAgICAgICAgbGFzdFJ1bkF0OiB0YXNrU3RhdHVzLmxhc3RSdW5BdCxcbiAgICAgICAgICAgICAgZGVsYXllZE1TOiBudWxsLFxuICAgICAgICAgICAgICB0aW1lb3V0SWQ6IG51bGwsXG4gICAgICAgICAgICAgIG5leHQ6IG51bGwsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgc2V0VGFza1N0YXR1cyhuZXdUYXNrU3RhdHVzKTtcbi8vICAgICAgICAgICAgc2VsZi5jaGFuZ2VUYXNrQ29uZmlnUGFyYW1ldGVycyh0YXNrTmFtZSwgeyBzaG91bGRSdW46IGZhbHNlIH0pO1xuICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgZnVuY3Rpb24oKSB7XG4gICAgICAgIGxldCB0YXNrU3RhdHVzID0gZ2V0VGFza1N0YXR1cyh0YXNrTmFtZSk7XG4gICAgICAgIHN3aXRjaCh0YXNrU3RhdHVzLnN0YXRlKSB7XG4gICAgICAgICAgY2FzZSB0YXNrU1RBVEVTLmRlbGF5ZWQ6XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICBjYXNlIHRhc2tTVEFURVMuc3RvcHBpbmc6XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvciAoYCR7c2VsZi5tZX0ucnVuVGFzazogVW5leHBlY3RlZCB0YXNrU3RhdGVbXCIke3Rhc2tOYW1lfVwiXSAke3Rhc2tTdGF0dXMuc3RhdGV9IClgKVxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgZnVuY3Rpb24oZXJyLCByZXN1bHRzKSB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICB0aHJvdyAoZXJyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBuZXdUYXNrU3RhdHVzID0ge1xuICAgICAgICAgIHRhc2tOYW1lOiB0YXNrTmFtZSxcbiAgICAgICAgICBzdGF0ZTogdGFza1NUQVRFUy5zdG9wcGVkLFxuICAgICAgICAgIGxhc3RSdW5BdDogdGFza1N0YXR1cy5sYXN0UnVuQXQsXG4gICAgICAgICAgZGVsYXllZE1TOiBudWxsLFxuICAgICAgICAgIHRpbWVvdXRJZDogbnVsbCxcbiAgICAgICAgICBuZXh0OiBudWxsLFxuICAgICAgICB9O1xuICAgICAgICBzZXRUYXNrU3RhdHVzKG5ld1Rhc2tTdGF0dXMpO1xuICAgICAgICAvL3NlbGYuY2hhbmdlVGFza0NvbmZpZ1BhcmFtZXRlcnModGFza05hbWUsIHsgc2hvdWxkUnVuOiBmYWxzZSB9KTtcblxuICAgICAgICBpZiAoXy5pc0Z1bmN0aW9uKGNhbGxiYWNrQWZ0ZXJTdG9wcGVkKSkge1xuICAgICAgICAgIGNhbGxiYWNrQWZ0ZXJTdG9wcGVkLmNhbGwoc2VsZik7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgc3RvcFRhc2sodGFza05hbWUpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBjb25zdCBnZXRUYXNrU3RhdHVzID0gXy5iaW5kKF9nZXRUYXNrU3RhdHVzLCBzZWxmKTtcbiAgICBjb25zdCBzZXRUYXNrU3RhdHVzID0gXy5iaW5kKF9zZXRUYXNrU3RhdHVzLCBzZWxmKTtcblxuICAgIGxldCB0YXNrU3RhdHVzID0gZ2V0VGFza1N0YXR1cyh0YXNrTmFtZSk7XG4gICAgaWYoXy5pc051bGwodGFza1N0YXR1cykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtzZWxmLm1lfS5zdG9wVGFzazogVGFzayAke3Rhc2tOYW1lfSBpcyBub3QgcmVnaXN0ZXJlZGApO1xuICAgIH1cblxuICAgIHN3aXRjaCh0YXNrU3RhdHVzLnN0YXRlKSB7XG4gICAgICBjYXNlIHRhc2tTVEFURVMuc3RvcHBlZDpcbiAgICAgIGNhc2UgdGFza1NUQVRFUy5zdG9wcGluZzoge1xuICAgICAgICBzZWxmLmNoYW5nZVRhc2tDb25maWdQYXJhbWV0ZXJzKHRhc2tOYW1lLCB7IHNob3VsZFJ1bjogZmFsc2UgfSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSB0YXNrU1RBVEVTLmRlbGF5ZWQ6IHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRhc2tTdGF0dXMudGltZW91dElkKTtcbiAgICAgICAgbGV0IG5ld1Rhc2tTdGF0dXMgPSB7XG4gICAgICAgICAgdGFza05hbWU6IHRhc2tOYW1lLFxuICAgICAgICAgIHN0YXRlOiB0YXNrU1RBVEVTLnN0b3BwaW5nLFxuICAgICAgICAgIGxhc3RSdW5BdDogdGFza1N0YXR1cy5sYXN0UnVuQXQsXG4gICAgICAgICAgZGVsYXllZE1TOiBudWxsLFxuICAgICAgICAgIHRpbWVvdXRJZDogbnVsbCxcbiAgICAgICAgICBuZXh0OiBudWxsLFxuICAgICAgICB9O1xuICAgICAgICBzZXRUYXNrU3RhdHVzKG5ld1Rhc2tTdGF0dXMpO1xuICAgICAgICBzZWxmLmNoYW5nZVRhc2tDb25maWdQYXJhbWV0ZXJzKHRhc2tOYW1lLCB7IHNob3VsZFJ1bjogZmFsc2UgfSk7XG4gICAgICAgIHRhc2tTdGF0dXMubmV4dCgpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgdGFza1NUQVRFUy5ydW5uaW5nOiB7XG4gICAgICAgIGxldCBuZXdUYXNrU3RhdHVzID0ge1xuICAgICAgICAgIHRhc2tOYW1lOiB0YXNrTmFtZSxcbiAgICAgICAgICBzdGF0ZTogdGFza1NUQVRFUy5zdG9wcGluZyxcbiAgICAgICAgICBsYXN0UnVuQXQ6IHRhc2tTdGF0dXMubGFzdFJ1bkF0LFxuICAgICAgICAgIGRlbGF5ZWRNUzogdGFza1N0YXR1cy5kZWxheWVkTVMsXG4gICAgICAgICAgdGltZW91dElkOiB0YXNrU3RhdHVzLnRpbWVvdXRJZCxcbiAgICAgICAgICBuZXh0OiB0YXNrU3RhdHVzLm5leHQsXG4gICAgICAgIH07XG4gICAgICAgIHNldFRhc2tTdGF0dXMobmV3VGFza1N0YXR1cyk7XG4gICAgICAgIHNlbGYuY2hhbmdlVGFza0NvbmZpZ1BhcmFtZXRlcnModGFza05hbWUsIHsgc2hvdWxkUnVuOiBmYWxzZSB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBkZWZhdWx0OiB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgJHtzZWxmLm1lfS5zdG9wVGFzazogVW5yZWNvZ25pemVkIHRhc2sgc3RhdGUgJHt0YXNrU3RhdHVzLnN0YXRlfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0b3BBbGxUYXNrcygpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBjb25zdCBnZXRBbGxUYXNrc1N0YXR1cyA9IF8uYmluZChfZ2V0QWxsVGFza3NTdGF0dXMsIHNlbGYpO1xuXG5cbiAgICBjb25zdCBhbGxUYXNrc1N0YXR1cyA9IGdldEFsbFRhc2tzU3RhdHVzKCk7XG5cbiAgICBhbGxUYXNrc1N0YXR1cy5mb3JFYWNoKHRhc2sgPT4ge1xuICAgICAgc2VsZi5zdG9wVGFzayh0YXNrLnRhc2tOYW1lKTtcbiAgICB9KVxuICB9XG5cbiAgZ2V0U3RhdHVzKCkge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgbGV0IHdvcmtlclN0YXR1cyA9IF9zdGF0dXMuZ2V0KHNlbGYpO1xuXG4gICAgbGV0IGFsbFRhc2tzU3RhdHVzID0gX2dldEFsbFRhc2tzU3RhdHVzLmNhbGwoc2VsZik7XG4gICAgbGV0IHRhc2tzU3RhdHVzID0ge1xuICAgICAgdGFza3M6IGFsbFRhc2tzU3RhdHVzLm1hcCh0YXNrU3RhdHVzID0+IHtcbiAgICAgICAgbGV0IHRhc2tDb25maWcgPSBfZ2V0VGFza0NvbmZpZy5jYWxsKHNlbGYsIHRhc2tTdGF0dXMudGFza05hbWUpO1xuICAgICAgICBsZXQgcmVzdWx0ID0ge1xuICAgICAgICAgIHN0YXRlOiB0YXNrU3RhdHVzLnN0YXRlLFxuICAgICAgICAgIGxhc3RSdW5BdDogdGFza1N0YXR1cy5sYXN0UnVuQXQsXG4gICAgICAgICAgZGVsYXllZE1TOiB0YXNrU3RhdHVzLmRlbGF5ZWRNUyxcbiAgICAgICAgfTtcbiAgICAgICAgXy5tZXJnZShyZXN1bHQsIHRhc2tDb25maWcpO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfSksXG4gIH07XG5cbiAgICBsZXQgZGJDb25uID0gX2RiQ29ubi5nZXQoc2VsZik7XG4gICAgbGV0IGRiU3RhdHVzID0ge1xuICAgICAgZGJDb25uZWN0aW9uOiB7XG4gICAgICAgIG1vbmdvZGJVUkk6IGRiQ29ubiAmJiBgbW9uZ29kYjovLyR7ZGJDb25uLnVzZXJ9OioqKipAJHtkYkNvbm4uaG9zdH06JHtkYkNvbm4ucG9ydH0vJHtkYkNvbm4ubmFtZX1gIHx8ICcnLFxuICAgICAgICBzdGF0ZTogZGJDb25uICYmIG1vbmdvb3NlLkNvbm5lY3Rpb24uU1RBVEVTW2RiQ29ubi5fcmVhZHlTdGF0ZV0gfHwgbnVsbCxcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIF8ubWVyZ2Uoe30sIHdvcmtlclN0YXR1cywgdGFza3NTdGF0dXMsIGRiU3RhdHVzICk7XG4gIH1cblxuICBhZGRMb2dnZXJUcmFuc3BvcnQodHJhbnNwb3J0LCBvcHRpb25zKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICBsZXQgbG9nZ2VyID0gX2xvZ2dlci5nZXQoc2VsZik7XG4gICAgbG9nZ2VyLmFkZCh0cmFuc3BvcnQsIG9wdGlvbnMpO1xuICAgIF9sb2dnZXIuc2V0KHNlbGYsIGxvZ2dlcik7XG4gIH1cblxuICByZW1vdmVMb2dnZXJUcmFuc3BvcnQodHJhbnNwb3J0KSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICBsZXQgbG9nZ2VyID0gX2xvZ2dlci5nZXQoc2VsZik7XG4gICAgbG9nZ2VyLnJlbW92ZSh0cmFuc3BvcnQpO1xuICAgIF9sb2dnZXIuc2V0KHNlbGYsIGxvZ2dlcik7XG4gIH1cblxuICBjb25uZWN0TW9uZ29kYihtb25nb1VSSSwgY2FsbGJhY2spIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBsZXQgbG9nID0gc2VsZi5sb2c7XG5cbiAgICBpZiAoIV8uaXNGdW5jdGlvbihjYWxsYmFjaykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtzZWxmLm1lfS5jb25uZWN0TW9uZ29kYjogQ2FsbGJhY2sgaXMgbm90IGEgZnVuY3Rpb25gKVxuICAgIH1cblxuICAgIGxldCBkYkNvbm47XG4gICAgbGV0IG9wdGlvbnMgPSB7cmVwbHNldDoge3NvY2tldE9wdGlvbnM6IHtjb25uZWN0VGltZW91dE1TOiAxMDAwMH19fTtcbiAgICBkYkNvbm4gPSBtb25nb29zZS5jcmVhdGVDb25uZWN0aW9uKG1vbmdvVVJJLCBvcHRpb25zLCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIGxvZy5lcnJvcihgJHtzZWxmLm1lfS5kYkNvbm46ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2cuaW5mbyhgJHtzZWxmLm1lfS5kYkNvbm46IENvbm5lY3Rpb24gc3VjY2Vzc2Z1bGApO1xuICAgICAgfVxuICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICB9KTtcbiAgICBkYkNvbm4ub24oJ2Vycm9yJywgZnVuY3Rpb24gKGVycikgeyAgIC8vIGFueSBjb25uZWN0aW9uIGVycm9ycyB3aWxsIGJlIHdyaXR0ZW4gdG8gdGhlIGNvbnNvbGVcbiAgICAgIGxvZy5lcnJvcihgJHtzZWxmLm1lfS5kYkNvbm46ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gICAgfSk7XG5cbiAgICBfZGJDb25uLnNldChzZWxmLCBkYkNvbm4pO1xuXG4gICAgc2VsZi5yZWdpc3RlclRhc2soJ3JlZnJlc2hUYXNrQ29uZmlnc0Zyb21EYicpO1xuXG4gICAgY29uc3QgdGFza0NvbmZpZ1NjaGVtYSA9IHtcbiAgICAgIHJlZnJlc2hJbnRlcnZhbE1zOiB7XG4gICAgICAgIHR5cGU6IE51bWJlcixcbiAgICAgICAgZGVmYXVsdDogMTAwMCxcbiAgICAgIH1cbiAgICB9O1xuICAgIHNlbGYuc2V0RXh0ZW5kZWRUYXNrQ29uZmlnU2NoZW1hKCdyZWZyZXNoVGFza0NvbmZpZ3NGcm9tRGInLCB0YXNrQ29uZmlnU2NoZW1hKTtcbiAgICByZXR1cm4gZGJDb25uO1xuICB9XG5cbiAgc2V0RXh0ZW5kZWRUYXNrQ29uZmlnU2NoZW1hKHRhc2tOYW1lLCBjb25maWdTY2hlbWEpIHtcbiAgICBfc2V0VGFza0NvbmZpZ1NjaGVtYS5jYWxsKHRoaXMsIHRhc2tOYW1lLCBjb25maWdTY2hlbWEpO1xuICB9XG5cbiAgY2hhbmdlVGFza0NvbmZpZ1BhcmFtZXRlcnModGFza05hbWUsIGNvbmZpZ1BhcmFtZXRlcnNUb0NoYW5nZSA9IHt9LCBjYWxsYmFjaykge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgaWYgKCFfZ2V0VGFza1N0YXR1cy5jYWxsKHNlbGYsIHRhc2tOYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3NlbGYubWV9LmNoYW5nZVRhc2tDb25maWdQYXJhbWV0ZXJzOiBUYXNrIFwiJHt0YXNrTmFtZX1cIiBpcyBub3QgcmVnaXN0ZXJlZGApO1xuICAgIH1cblxuICAgIGlmIChjb25maWdQYXJhbWV0ZXJzVG9DaGFuZ2UuaGFzT3duUHJvcGVydHkoJ3Rhc2tOYW1lJykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtzZWxmLm1lfS5jaGFuZ2VUYXNrQ29uZmlnUGFyYW1ldGVyczogQ2Fubm90IGNoYW5nZSBcInRhc2tOYW1lXCJgKTtcbiAgICB9XG5cbiAgICBsZXQgY29uZmlnU2NoZW1hID0gX2dldFRhc2tDb25maWdTY2hlbWEuY2FsbChzZWxmLCB0YXNrTmFtZSk7XG4gICAgaWYgKCFjb25maWdTY2hlbWEpIHtcbiAgICAgIHNlbGYuc2V0RXh0ZW5kZWRUYXNrQ29uZmlnU2NoZW1hKHRhc2tOYW1lLCB7fSk7XG4gICAgICBjb25maWdTY2hlbWEgPSBfZ2V0VGFza0NvbmZpZ1NjaGVtYS5jYWxsKHNlbGYsIHRhc2tOYW1lKTtcbiAgICB9XG5cbiAgICBsZXQgZXhpc3RpbmdUYXNrQ29uZmlnID0gX2dldFRhc2tDb25maWcuY2FsbChzZWxmLCB0YXNrTmFtZSk7XG4gICAgbGV0IG5ld1Rhc2tDb25maWcgPSBfLm1lcmdlKHt9LCBleGlzdGluZ1Rhc2tDb25maWcsIGNvbmZpZ1BhcmFtZXRlcnNUb0NoYW5nZSk7XG4gICAgbmV3VGFza0NvbmZpZyA9IGdldE9iamVjdEZyb21TY2hlbWEoY29uZmlnU2NoZW1hLCBuZXdUYXNrQ29uZmlnKTtcblxuICAgIGxldCBjaGFuZ2VkUGFyYW1ldGVycyA9IGRlZXBEaWZmKGV4aXN0aW5nVGFza0NvbmZpZywgbmV3VGFza0NvbmZpZyk7XG5cbiAgICBuZXdUYXNrQ29uZmlnLmhhc0JlZW5TYXZlZHRvRGIgPSBleGlzdGluZ1Rhc2tDb25maWcuaGFzQmVlblNhdmVkdG9EYjtcbiAgICBpZiAoXy5pc0VxdWFsKGV4aXN0aW5nVGFza0NvbmZpZywgbmV3VGFza0NvbmZpZykgICYmIGV4aXN0aW5nVGFza0NvbmZpZy5oYXNCZWVuU2F2ZWR0b0RiKSAge1xuICAgICAgXy5pc0Z1bmN0aW9uKGNhbGxiYWNrKSAmJiBjYWxsYmFjayhudWxsKTtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIG5ld1Rhc2tDb25maWcuaGFzQmVlblNhdmVkdG9EYiA9IGZhbHNlO1xuICAgIF9zYXZlVGFza0NvbmZpZ1RvRGF0YWJhc2UuY2FsbChzZWxmLCBuZXdUYXNrQ29uZmlnLCBjYWxsYmFjayk7XG5cbiAgICBsZXQgdGFza1N0YXRlID0gX2dldFRhc2tTdGF0dXMuY2FsbChzZWxmLCB0YXNrTmFtZSkuc3RhdGU7XG5cbiAgICBpZiAoY2hhbmdlZFBhcmFtZXRlcnMuc2hvdWxkUnVuID09PSB0cnVlICYmICh0YXNrU3RhdGUgPT09IHRhc2tTVEFURVMuc3RvcHBlZCB8fCB0YXNrU3RhdGUgPT09IHRhc2tTVEFURVMuc3RvcHBpbmcpKSB7XG4gICAgICBzZWxmLnJ1blRhc2sodGFza05hbWUpO1xuICAgIH1cblxuICAgIGlmIChjaGFuZ2VkUGFyYW1ldGVycy5zaG91bGRSdW4gPT09IGZhbHNlICYmICh0YXNrU3RhdGUgPT09IHRhc2tTVEFURVMucnVubmluZyB8fCB0YXNrU3RhdGUgPT09IHRhc2tTVEFURVMuZGVsYXllZCkpIHtcbiAgICAgIHNlbGYuc3RvcFRhc2sodGFza05hbWUpO1xuICAgIH1cbiAgfVxuXG4gIHJlZnJlc2hUYXNrQ29uZmlnc0Zyb21EYihuZXh0KSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgbGV0IGxvZyA9IHNlbGYubG9nO1xuXG4gICAgbGV0IHRhc2tzID0gc2VsZi5nZXRTdGF0dXMoKS50YXNrcztcbiAgICBlYWNoKHRhc2tzLFxuICAgICAgZnVuY3Rpb24gKHRhc2ssIGNhbGxiYWNrKSB7XG4gICAgICAgIGxldCB0YXNrTmFtZSA9IHRhc2sudGFza05hbWU7XG4gICAgICAgIGxldCBDb25maWdNb2RlbCA9IF9nZXRUYXNrQ29uZmlnTW9kZWwuY2FsbChzZWxmLCB0YXNrTmFtZSk7XG4gICAgICAgIENvbmZpZ01vZGVsLmZpbmRPbmUoeyB0YXNrTmFtZTogdGFza05hbWUgfSkubGVhbigpLnNldE9wdGlvbnMoeyBtYXhUaW1lTVMgOiAxMCB9KS5leGVjKGZ1bmN0aW9uIChlcnIsIHRhc2tDb25maWdGcm9tRGIpIHtcbiAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICBsb2cuZXJyb3IoYCR7c2VsZi5tZX0ucmVmcmVzaFRhc2tDb25maWdzRnJvbURiICR7ZXJyLm1lc3NhZ2V9YCk7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2sobnVsbCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbGV0IHRhc2tDb25maWcgPSBfZ2V0VGFza0NvbmZpZy5jYWxsKHNlbGYsIHRhc2tOYW1lKTtcbiAgICAgICAgICBpZiAodGFza0NvbmZpZ0Zyb21EYikge1xuICAgICAgICAgICAgbGV0IG5ld0NvbmZpZ1BhcmFtZXRlcnMgPSBfLmNsb25lRGVlcCh0YXNrQ29uZmlnRnJvbURiKTtcbiAgICAgICAgICAgIGRlbGV0ZSBuZXdDb25maWdQYXJhbWV0ZXJzLnRhc2tOYW1lO1xuICAgICAgICAgICAgZGVsZXRlIG5ld0NvbmZpZ1BhcmFtZXRlcnMuX2lkO1xuICAgICAgICAgICAgZGVsZXRlIG5ld0NvbmZpZ1BhcmFtZXRlcnMuX192O1xuICAgICAgICAgICAgZGVsZXRlIG5ld0NvbmZpZ1BhcmFtZXRlcnMuJHNldE9uSW5zZXJ0O1xuICAgICAgICAgICAgc2VsZi5jaGFuZ2VUYXNrQ29uZmlnUGFyYW1ldGVycyh0YXNrTmFtZSwgbmV3Q29uZmlnUGFyYW1ldGVycywgY2FsbGJhY2spO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBfc2F2ZVRhc2tDb25maWdUb0RhdGFiYXNlLmNhbGwoc2VsZiwgdGFza0NvbmZpZyk7XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgICAgZnVuY3Rpb24gKGVycil7XG4gICAgICAgIGxldCByZWZyZXNoSW50ZXJ2YWxNcyA9IF9nZXRUYXNrQ29uZmlnLmNhbGwoc2VsZiwgJ3JlZnJlc2hUYXNrQ29uZmlnc0Zyb21EYicpLnJlZnJlc2hJbnRlcnZhbE1zO1xuICAgICAgICBuZXh0KHJlZnJlc2hJbnRlcnZhbE1zKTtcbiAgICAgIH0pO1xuICB9XG59XG4iXX0=