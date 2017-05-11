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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9pbmRleC5qcyJdLCJuYW1lcyI6WyJlbWl0dGVyIiwiX3N0YXR1cyIsIldlYWtNYXAiLCJfbG9nZ2VyIiwiVGFza1dvcmtlciIsIndvcmtlck5hbWUiLCJzZWxmIiwibWUiLCJsb2dnZXIiLCJMb2dnZXIiLCJ0cmFuc3BvcnRzIiwiQ29uc29sZSIsImNvbG9yaXplIiwibGV2ZWwiLCJzZXRMZXZlbHMiLCJjb25maWciLCJzeXNsb2ciLCJsZXZlbHMiLCJzZXQiLCJsb2ciLCJmb3JFYWNoIiwiYmluZCIsIndvcmtlciIsInJlc3RhcnRlZEF0IiwiRGF0ZSIsInRhc2tOYW1lIiwiaXNGdW5jdGlvbiIsIkVycm9yIiwiY2FsbCIsInNldEV4dGVuZGVkVGFza0NvbmZpZ1NjaGVtYSIsImNhbGxiYWNrQWZ0ZXJTdG9wcGVkIiwiZ2V0VGFza1N0YXR1cyIsInNldFRhc2tTdGF0dXMiLCJ0YXNrU3RhdHVzIiwiaXNOdWxsIiwidGFza0Z1bmN0aW9uIiwic3RhdGUiLCJydW5uaW5nIiwic3RvcHBpbmciLCJkZWxheWVkIiwibmV4dCIsImNsZWFyVGltZW91dCIsInRpbWVvdXRJZCIsIm5ld1Rhc2tTdGF0dXMiLCJsYXN0UnVuQXQiLCJkZWxheWVkTVMiLCJjaGFuZ2VUYXNrQ29uZmlnUGFyYW1ldGVycyIsInNob3VsZFJ1biIsImNhbGxiYWNrIiwiZGVsYXlNUyIsInN0b3BwZWQiLCJpc051bWJlciIsInNldFRpbWVvdXQiLCJlcnIiLCJyZXN1bHRzIiwiZ2V0QWxsVGFza3NTdGF0dXMiLCJhbGxUYXNrc1N0YXR1cyIsInN0b3BUYXNrIiwidGFzayIsIndvcmtlclN0YXR1cyIsImdldCIsInRhc2tzU3RhdHVzIiwidGFza3MiLCJtYXAiLCJ0YXNrQ29uZmlnIiwicmVzdWx0IiwibWVyZ2UiLCJkYkNvbm4iLCJkYlN0YXR1cyIsImRiQ29ubmVjdGlvbiIsIm1vbmdvZGJVUkkiLCJ1c2VyIiwiaG9zdCIsInBvcnQiLCJuYW1lIiwiQ29ubmVjdGlvbiIsIlNUQVRFUyIsIl9yZWFkeVN0YXRlIiwidHJhbnNwb3J0Iiwib3B0aW9ucyIsImFkZCIsInJlbW92ZSIsIm1vbmdvVVJJIiwicmVwbHNldCIsInNvY2tldE9wdGlvbnMiLCJjb25uZWN0VGltZW91dE1TIiwiY3JlYXRlQ29ubmVjdGlvbiIsImVycm9yIiwibWVzc2FnZSIsImluZm8iLCJvbiIsInJlZ2lzdGVyVGFzayIsInRhc2tDb25maWdTY2hlbWEiLCJyZWZyZXNoSW50ZXJ2YWxNcyIsInR5cGUiLCJOdW1iZXIiLCJkZWZhdWx0IiwiY29uZmlnU2NoZW1hIiwiY29uZmlnUGFyYW1ldGVyc1RvQ2hhbmdlIiwiaGFzT3duUHJvcGVydHkiLCJleGlzdGluZ1Rhc2tDb25maWciLCJuZXdUYXNrQ29uZmlnIiwiY2hhbmdlZFBhcmFtZXRlcnMiLCJoYXNCZWVuU2F2ZWR0b0RiIiwiaXNFcXVhbCIsInRhc2tTdGF0ZSIsInJ1blRhc2siLCJnZXRTdGF0dXMiLCJDb25maWdNb2RlbCIsImZpbmRPbmUiLCJsZWFuIiwic2V0T3B0aW9ucyIsIm1heFRpbWVNUyIsImV4ZWMiLCJ0YXNrQ29uZmlnRnJvbURiIiwibmV3Q29uZmlnUGFyYW1ldGVycyIsImNsb25lRGVlcCIsIl9pZCIsIl9fdiIsIiRzZXRPbkluc2VydCJdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7QUFFQTs7OztBQUNBOztBQUNBOzs7O0FBQ0E7Ozs7QUFDQTs7OztBQUVBOztBQUNBOztBQUNBOzs7Ozs7QUFFQSxJQUFJQSxVQUFVLDRCQUFHLEVBQUgsQ0FBZDtBQUNBLElBQUlDLFVBQVUsSUFBSUMsT0FBSixFQUFkO0FBQ0EsSUFBSUMsVUFBVSxJQUFJRCxPQUFKLEVBQWQ7O0lBR3FCRSxVO0FBQ25CLHNCQUFZQyxVQUFaLEVBQXdCO0FBQUE7O0FBQ3RCLFFBQUlDLE9BQVEsSUFBWjtBQUNBQSxTQUFLQyxFQUFMLEdBQVVGLFVBQVY7O0FBRUEsUUFBSUcsU0FBUyxJQUFLLGtCQUFRQyxNQUFiLENBQXFCO0FBQ2hDQyxrQkFBWSxDQUNWLElBQUss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QUFhLGdDQUFlcEMsSUFBZixDQUFvQnRCLElBQXBCLEVBQTBCbUIsUUFBMUIsQ0FBakI7QUFDQSxjQUFJeUYsZ0JBQUosRUFBc0I7QUFDcEIsZ0JBQUlDLHNCQUFzQixpQkFBRUMsU0FBRixDQUFZRixnQkFBWixDQUExQjtBQUNBLG1CQUFPQyxvQkFBb0IxRixRQUEzQjtBQUNBLG1CQUFPMEYsb0JBQW9CRSxHQUEzQjtBQUNBLG1CQUFPRixvQkFBb0JHLEdBQTNCO0FBQ0EsbUJBQU9ILG9CQUFvQkksWUFBM0I7QUFDQWpILGlCQUFLd0MsMEJBQUwsQ0FBZ0NyQixRQUFoQyxFQUEwQzBGLG1CQUExQyxFQUErRG5FLFFBQS9EO0FBQ0QsV0FQRCxNQU9PO0FBQ0wsdURBQTBCcEIsSUFBMUIsQ0FBK0J0QixJQUEvQixFQUFxQzBELFVBQXJDO0FBQ0FoQjtBQUNEO0FBQ0YsU0FsQkQ7QUFtQkQsT0F2QkgsRUF3QkUsVUFBVUssR0FBVixFQUFjO0FBQ1osWUFBSXdDLG9CQUFvQixnQ0FBZWpFLElBQWYsQ0FBb0J0QixJQUFwQixFQUEwQiwwQkFBMUIsRUFBc0R1RixpQkFBOUU7QUFDQXJELGFBQUtxRCxpQkFBTDtBQUNELE9BM0JIO0FBNEJEOzs7Ozs7a0JBallrQnpGLFUiLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCc7XG5cbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgeyBkb1doaWxzdCwgZWFjaCB9IGZyb20gJ2FzeW5jJztcbmltcG9ydCBtb25nb29zZSBmcm9tICdtb25nb29zZSc7XG5pbXBvcnQgd2luc3RvbiBmcm9tICd3aW5zdG9uJztcbmltcG9ydCBlZSBmcm9tICdldmVudC1lbWl0dGVyJztcblxuaW1wb3J0IHsgZ2V0T2JqZWN0RnJvbVNjaGVtYSwgZGVlcERpZmYgfSBmcm9tICcuL2xpYi91dGlscyc7XG5pbXBvcnQgeyBfcmVnaXN0ZXJUYXNrLCBfZ2V0VGFza1N0YXR1cywgX3NldFRhc2tTdGF0dXMsIF9nZXRBbGxUYXNrc1N0YXR1cywgdGFza1NUQVRFUyB9IGZyb20gJy4vbGliL3Rhc2tTdGF0ZVV0aWxzJztcbmltcG9ydCB7IF9zZXRUYXNrQ29uZmlnU2NoZW1hLCBfZ2V0VGFza0NvbmZpZ1NjaGVtYSwgX2dldFRhc2tDb25maWdNb2RlbCwgX2dldFRhc2tDb25maWcsIF9zYXZlVGFza0NvbmZpZ1RvRGF0YWJhc2UsIF9kYkNvbm4gfSBmcm9tICcuL2xpYi90YXNrQ29uZmlnVXRpbHMuanMnO1xuXG5sZXQgZW1pdHRlciA9IGVlKHt9KTtcbmxldCBfc3RhdHVzID0gbmV3IFdlYWtNYXAoKTtcbmxldCBfbG9nZ2VyID0gbmV3IFdlYWtNYXAoKTtcblxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBUYXNrV29ya2VyIHtcbiAgY29uc3RydWN0b3Iod29ya2VyTmFtZSkge1xuICAgIGxldCBzZWxmICA9IHRoaXM7XG4gICAgc2VsZi5tZSA9IHdvcmtlck5hbWU7XG5cbiAgICBsZXQgbG9nZ2VyID0gbmV3ICh3aW5zdG9uLkxvZ2dlcikoe1xuICAgICAgdHJhbnNwb3J0czogW1xuICAgICAgICBuZXcgKHdpbnN0b24udHJhbnNwb3J0cy5Db25zb2xlKSh7XG4gICAgICAgICAgY29sb3JpemU6IHRydWUsXG4gICAgICAgICAgbGV2ZWw6ICdkZWJ1ZycsXG4gICAgICAgIH0pXG4gICAgICBdLFxuICAgIH0pO1xuICAgIGxvZ2dlci5zZXRMZXZlbHMod2luc3Rvbi5jb25maWcuc3lzbG9nLmxldmVscyk7XG4gICAgX2xvZ2dlci5zZXQoc2VsZiwgbG9nZ2VyKTtcblxuICAgIHNlbGYubG9nID0ge307XG4gICAgWydlbWVyZycsICdhbGVydCcsICdjcml0JywgJ2Vycm9yJywgJ3dhcm5pbmcnLCAnbm90aWNlJywgJ2luZm8nLCAnZGVidWcnXS5mb3JFYWNoKGxldmVsID0+IHtcbiAgICAgIHNlbGYubG9nW2xldmVsXSA9IF8uYmluZChsb2dnZXJbbGV2ZWxdLCBzZWxmKTtcbiAgICB9KTtcblxuICAgIF9zdGF0dXMuc2V0KHNlbGYsIHtcbiAgICAgIHdvcmtlcjoge1xuICAgICAgICByZXN0YXJ0ZWRBdDogbmV3IERhdGUoKSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH1cblxuICByZWdpc3RlclRhc2sodGFza05hbWUpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcblxuICAgIGlmICghXy5pc0Z1bmN0aW9uKHNlbGZbdGFza05hbWVdKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3NlbGYubWV9LnJlZ2lzdGVyVGFzazogVGFzayAke3Rhc2tOYW1lfSBpcyBub3QgYSBtZXRob2Qgb2YgdGhpcyBvYmplY3RgKTtcbiAgICB9XG5cbiAgICBfcmVnaXN0ZXJUYXNrLmNhbGwoc2VsZiwgdGFza05hbWUpO1xuICAgIHNlbGYuc2V0RXh0ZW5kZWRUYXNrQ29uZmlnU2NoZW1hKHRhc2tOYW1lLCB7fSk7XG4gIH1cblxuICBydW5UYXNrKHRhc2tOYW1lLCBjYWxsYmFja0FmdGVyU3RvcHBlZCkge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGNvbnN0IGdldFRhc2tTdGF0dXMgPSBfLmJpbmQoX2dldFRhc2tTdGF0dXMsIHNlbGYpO1xuICAgIGNvbnN0IHNldFRhc2tTdGF0dXMgPSBfLmJpbmQoX3NldFRhc2tTdGF0dXMsIHNlbGYpO1xuXG4gICAgbGV0IHRhc2tTdGF0dXMgPSBnZXRUYXNrU3RhdHVzKHRhc2tOYW1lKTtcbiAgICBpZihfLmlzTnVsbCh0YXNrU3RhdHVzKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3NlbGYubWV9LnJ1blRhc2s6IFRhc2sgJHt0YXNrTmFtZX0gaXMgbm90IHJlZ2lzdGVyZWRgKTtcbiAgICB9XG5cbiAgICBjb25zdCB0YXNrRnVuY3Rpb24gPSBfLmJpbmQoc2VsZlt0YXNrTmFtZV0sIHNlbGYpO1xuXG4gICAgaWYgKHRhc2tTdGF0dXMuc3RhdGUgPT09IHRhc2tTVEFURVMucnVubmluZyB8fCB0YXNrU3RhdHVzLnN0YXRlID09PSB0YXNrU1RBVEVTLnN0b3BwaW5nKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAodGFza1N0YXR1cy5zdGF0ZSA9PT0gdGFza1NUQVRFUy5kZWxheWVkKSB7XG4gICAgICBpZiAoXy5pc0Z1bmN0aW9uKHRhc2tTdGF0dXMubmV4dCkpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRhc2tTdGF0dXMudGltZW91dElkKTtcbiAgICAgICAgdGFza1N0YXR1cy5uZXh0KCk7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIChgJHtzZWxmLm1lfS5ydW5UYXNrOiBuZXh0IGlzICR7dGFza1N0YXR1cy5uZXh0fSAobm90IGEgZnVuY3Rpb24pYClcbiAgICAgIH1cbiAgICB9XG5cbiAgICBsZXQgbmV3VGFza1N0YXR1cyA9IHtcbiAgICAgIHRhc2tOYW1lOiB0YXNrTmFtZSxcbiAgICAgIHN0YXRlOiB0YXNrU1RBVEVTLnJ1bm5pbmcsXG4gICAgICBsYXN0UnVuQXQ6IG5ldyBEYXRlKCksXG4gICAgICBkZWxheWVkTVM6IG51bGwsXG4gICAgICB0aW1lb3V0SWQ6IG51bGwsXG4gICAgICBuZXh0Om51bGwsXG4gICAgfTtcbiAgICBzZXRUYXNrU3RhdHVzKG5ld1Rhc2tTdGF0dXMpO1xuXG4gICAgc2VsZi5jaGFuZ2VUYXNrQ29uZmlnUGFyYW1ldGVycyh0YXNrTmFtZSwgeyBzaG91bGRSdW46IHRydWUgfSk7XG5cbiAgICBkb1doaWxzdChcbiAgICAgIGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgICAgIGxldCBuZXdUYXNrU3RhdHVzID0ge1xuICAgICAgICAgIHRhc2tOYW1lOiB0YXNrTmFtZSxcbiAgICAgICAgICBzdGF0ZTogdGFza1NUQVRFUy5ydW5uaW5nLFxuICAgICAgICAgIGxhc3RSdW5BdDogbmV3IERhdGUoKSxcbiAgICAgICAgICBkZWxheWVkTVM6IG51bGwsXG4gICAgICAgICAgdGltZW91dElkOiBudWxsLFxuICAgICAgICAgIG5leHQ6bnVsbCxcbiAgICAgICAgfTtcbiAgICAgICAgc2V0VGFza1N0YXR1cyhuZXdUYXNrU3RhdHVzKTtcbiAgICAgICAgLy8gc2VsZi5jaGFuZ2VUYXNrQ29uZmlnUGFyYW1ldGVycyh0YXNrTmFtZSwgeyBzaG91bGRSdW46IHRydWUgfSk7XG5cbiAgICAgICAgdGFza0Z1bmN0aW9uKGZ1bmN0aW9uKGRlbGF5TVMpIHtcbiAgICAgICAgICBsZXQgdGFza1N0YXR1cyA9IGdldFRhc2tTdGF0dXModGFza05hbWUpO1xuICAgICAgICAgIGlmICh0YXNrU3RhdHVzLnN0YXRlID09PSB0YXNrU1RBVEVTLmRlbGF5ZWQgfHwgdGFza1N0YXR1cy5zdGF0ZSA9PT0gdGFza1NUQVRFUy5zdG9wcGVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgKGAke3NlbGYubWV9LnJ1blRhc2s6IFVuZXhwZWN0ZWQgdGFza1N0YXRlW1wiJHt0YXNrTmFtZX1cIl0gPSBcIiR7dGFza1N0YXR1cy5zdGF0ZX1cImApXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYoIShfLmlzTnVtYmVyKGRlbGF5TVMpIHx8IF8uaXNOdWxsKGRlbGF5TVMpKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yIChgJHtzZWxmLm1lfS4ke3Rhc2tOYW1lfTogbmV4dCgpIGNhbGxlZCB3aXRoIHdyb25nIHBhcmFtZXRlciB0eXBlICgke3R5cGVvZiBkZWxheU1TfSlgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZihfLmlzTnVtYmVyKGRlbGF5TVMpICYmIHRhc2tTdGF0dXMuc3RhdGUgPT09IHRhc2tTVEFURVMucnVubmluZykge1xuICAgICAgICAgICAgbGV0IG5leHQgPSBfLmJpbmQoY2FsbGJhY2ssIHNlbGYpO1xuICAgICAgICAgICAgbGV0IG5ld1Rhc2tTdGF0dXMgPSB7XG4gICAgICAgICAgICAgIHRhc2tOYW1lOiB0YXNrTmFtZSxcbiAgICAgICAgICAgICAgc3RhdGU6IHRhc2tTVEFURVMuZGVsYXllZCxcbiAgICAgICAgICAgICAgbGFzdFJ1bkF0OiB0YXNrU3RhdHVzLmxhc3RSdW5BdCxcbiAgICAgICAgICAgICAgZGVsYXllZE1TOiBkZWxheU1TLFxuICAgICAgICAgICAgICB0aW1lb3V0SWQ6IHNldFRpbWVvdXQobmV4dCwgZGVsYXlNUyksXG4gICAgICAgICAgICAgIG5leHQ6IF8uYmluZChjYWxsYmFjaywgdGhpcyksXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgc2V0VGFza1N0YXR1cyhuZXdUYXNrU3RhdHVzKTtcbi8vICAgICAgICAgICAgc2VsZi5jaGFuZ2VUYXNrQ29uZmlnUGFyYW1ldGVycyh0YXNrTmFtZSwgeyBzaG91bGRSdW46IHRydWUgfSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBuZXdUYXNrU3RhdHVzID0ge1xuICAgICAgICAgICAgICB0YXNrTmFtZTogdGFza05hbWUsXG4gICAgICAgICAgICAgIHN0YXRlOiB0YXNrU1RBVEVTLnN0b3BwaW5nLFxuICAgICAgICAgICAgICBsYXN0UnVuQXQ6IHRhc2tTdGF0dXMubGFzdFJ1bkF0LFxuICAgICAgICAgICAgICBkZWxheWVkTVM6IG51bGwsXG4gICAgICAgICAgICAgIHRpbWVvdXRJZDogbnVsbCxcbiAgICAgICAgICAgICAgbmV4dDogbnVsbCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBzZXRUYXNrU3RhdHVzKG5ld1Rhc2tTdGF0dXMpO1xuLy8gICAgICAgICAgICBzZWxmLmNoYW5nZVRhc2tDb25maWdQYXJhbWV0ZXJzKHRhc2tOYW1lLCB7IHNob3VsZFJ1bjogZmFsc2UgfSk7XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgICBmdW5jdGlvbigpIHtcbiAgICAgICAgbGV0IHRhc2tTdGF0dXMgPSBnZXRUYXNrU3RhdHVzKHRhc2tOYW1lKTtcbiAgICAgICAgc3dpdGNoKHRhc2tTdGF0dXMuc3RhdGUpIHtcbiAgICAgICAgICBjYXNlIHRhc2tTVEFURVMuZGVsYXllZDpcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIGNhc2UgdGFza1NUQVRFUy5zdG9wcGluZzpcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yIChgJHtzZWxmLm1lfS5ydW5UYXNrOiBVbmV4cGVjdGVkIHRhc2tTdGF0ZVtcIiR7dGFza05hbWV9XCJdICR7dGFza1N0YXR1cy5zdGF0ZX0gKWApXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBmdW5jdGlvbihlcnIsIHJlc3VsdHMpIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIHRocm93IChlcnIpO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IG5ld1Rhc2tTdGF0dXMgPSB7XG4gICAgICAgICAgdGFza05hbWU6IHRhc2tOYW1lLFxuICAgICAgICAgIHN0YXRlOiB0YXNrU1RBVEVTLnN0b3BwZWQsXG4gICAgICAgICAgbGFzdFJ1bkF0OiB0YXNrU3RhdHVzLmxhc3RSdW5BdCxcbiAgICAgICAgICBkZWxheWVkTVM6IG51bGwsXG4gICAgICAgICAgdGltZW91dElkOiBudWxsLFxuICAgICAgICAgIG5leHQ6IG51bGwsXG4gICAgICAgIH07XG4gICAgICAgIHNldFRhc2tTdGF0dXMobmV3VGFza1N0YXR1cyk7XG4gICAgICAgIC8vc2VsZi5jaGFuZ2VUYXNrQ29uZmlnUGFyYW1ldGVycyh0YXNrTmFtZSwgeyBzaG91bGRSdW46IGZhbHNlIH0pO1xuXG4gICAgICAgIGlmIChfLmlzRnVuY3Rpb24oY2FsbGJhY2tBZnRlclN0b3BwZWQpKSB7XG4gICAgICAgICAgY2FsbGJhY2tBZnRlclN0b3BwZWQuY2FsbChzZWxmKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBzdG9wVGFzayh0YXNrTmFtZSkge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGNvbnN0IGdldFRhc2tTdGF0dXMgPSBfLmJpbmQoX2dldFRhc2tTdGF0dXMsIHNlbGYpO1xuICAgIGNvbnN0IHNldFRhc2tTdGF0dXMgPSBfLmJpbmQoX3NldFRhc2tTdGF0dXMsIHNlbGYpO1xuXG4gICAgbGV0IHRhc2tTdGF0dXMgPSBnZXRUYXNrU3RhdHVzKHRhc2tOYW1lKTtcbiAgICBpZihfLmlzTnVsbCh0YXNrU3RhdHVzKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3NlbGYubWV9LnN0b3BUYXNrOiBUYXNrICR7dGFza05hbWV9IGlzIG5vdCByZWdpc3RlcmVkYCk7XG4gICAgfVxuXG4gICAgc3dpdGNoKHRhc2tTdGF0dXMuc3RhdGUpIHtcbiAgICAgIGNhc2UgdGFza1NUQVRFUy5zdG9wcGVkOlxuICAgICAgY2FzZSB0YXNrU1RBVEVTLnN0b3BwaW5nOiB7XG4gICAgICAgIHNlbGYuY2hhbmdlVGFza0NvbmZpZ1BhcmFtZXRlcnModGFza05hbWUsIHsgc2hvdWxkUnVuOiBmYWxzZSB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlIHRhc2tTVEFURVMuZGVsYXllZDoge1xuICAgICAgICBjbGVhclRpbWVvdXQodGFza1N0YXR1cy50aW1lb3V0SWQpO1xuICAgICAgICBsZXQgbmV3VGFza1N0YXR1cyA9IHtcbiAgICAgICAgICB0YXNrTmFtZTogdGFza05hbWUsXG4gICAgICAgICAgc3RhdGU6IHRhc2tTVEFURVMuc3RvcHBpbmcsXG4gICAgICAgICAgbGFzdFJ1bkF0OiB0YXNrU3RhdHVzLmxhc3RSdW5BdCxcbiAgICAgICAgICBkZWxheWVkTVM6IG51bGwsXG4gICAgICAgICAgdGltZW91dElkOiBudWxsLFxuICAgICAgICAgIG5leHQ6IG51bGwsXG4gICAgICAgIH07XG4gICAgICAgIHNldFRhc2tTdGF0dXMobmV3VGFza1N0YXR1cyk7XG4gICAgICAgIHNlbGYuY2hhbmdlVGFza0NvbmZpZ1BhcmFtZXRlcnModGFza05hbWUsIHsgc2hvdWxkUnVuOiBmYWxzZSB9KTtcbiAgICAgICAgdGFza1N0YXR1cy5uZXh0KCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSB0YXNrU1RBVEVTLnJ1bm5pbmc6IHtcbiAgICAgICAgbGV0IG5ld1Rhc2tTdGF0dXMgPSB7XG4gICAgICAgICAgdGFza05hbWU6IHRhc2tOYW1lLFxuICAgICAgICAgIHN0YXRlOiB0YXNrU1RBVEVTLnN0b3BwaW5nLFxuICAgICAgICAgIGxhc3RSdW5BdDogdGFza1N0YXR1cy5sYXN0UnVuQXQsXG4gICAgICAgICAgZGVsYXllZE1TOiB0YXNrU3RhdHVzLmRlbGF5ZWRNUyxcbiAgICAgICAgICB0aW1lb3V0SWQ6IHRhc2tTdGF0dXMudGltZW91dElkLFxuICAgICAgICAgIG5leHQ6IHRhc2tTdGF0dXMubmV4dCxcbiAgICAgICAgfTtcbiAgICAgICAgc2V0VGFza1N0YXR1cyhuZXdUYXNrU3RhdHVzKTtcbiAgICAgICAgc2VsZi5jaGFuZ2VUYXNrQ29uZmlnUGFyYW1ldGVycyh0YXNrTmFtZSwgeyBzaG91bGRSdW46IGZhbHNlIH0pO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGRlZmF1bHQ6IHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3NlbGYubWV9LnN0b3BUYXNrOiBVbnJlY29nbml6ZWQgdGFzayBzdGF0ZSAke3Rhc2tTdGF0dXMuc3RhdGV9YCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RvcEFsbFRhc2tzKCkge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGNvbnN0IGdldEFsbFRhc2tzU3RhdHVzID0gXy5iaW5kKF9nZXRBbGxUYXNrc1N0YXR1cywgc2VsZik7XG5cblxuICAgIGNvbnN0IGFsbFRhc2tzU3RhdHVzID0gZ2V0QWxsVGFza3NTdGF0dXMoKTtcblxuICAgIGFsbFRhc2tzU3RhdHVzLmZvckVhY2godGFzayA9PiB7XG4gICAgICBzZWxmLnN0b3BUYXNrKHRhc2sudGFza05hbWUpO1xuICAgIH0pXG4gIH1cblxuICBnZXRTdGF0dXMoKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICBsZXQgd29ya2VyU3RhdHVzID0gX3N0YXR1cy5nZXQoc2VsZik7XG5cbiAgICBsZXQgYWxsVGFza3NTdGF0dXMgPSBfZ2V0QWxsVGFza3NTdGF0dXMuY2FsbChzZWxmKTtcbiAgICBsZXQgdGFza3NTdGF0dXMgPSB7XG4gICAgICB0YXNrczogYWxsVGFza3NTdGF0dXMubWFwKHRhc2tTdGF0dXMgPT4ge1xuICAgICAgICBsZXQgdGFza0NvbmZpZyA9IF9nZXRUYXNrQ29uZmlnLmNhbGwoc2VsZiwgdGFza1N0YXR1cy50YXNrTmFtZSk7XG4gICAgICAgIGxldCByZXN1bHQgPSB7XG4gICAgICAgICAgc3RhdGU6IHRhc2tTdGF0dXMuc3RhdGUsXG4gICAgICAgICAgbGFzdFJ1bkF0OiB0YXNrU3RhdHVzLmxhc3RSdW5BdCxcbiAgICAgICAgICBkZWxheWVkTVM6IHRhc2tTdGF0dXMuZGVsYXllZE1TLFxuICAgICAgICB9O1xuICAgICAgICBfLm1lcmdlKHJlc3VsdCwgdGFza0NvbmZpZyk7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9KSxcbiAgfTtcblxuICAgIGxldCBkYkNvbm4gPSBfZGJDb25uLmdldChzZWxmKTtcbiAgICBsZXQgZGJTdGF0dXMgPSB7XG4gICAgICBkYkNvbm5lY3Rpb246IHtcbiAgICAgICAgbW9uZ29kYlVSSTogZGJDb25uICYmIGBtb25nb2RiOi8vJHtkYkNvbm4udXNlcn06KioqKkAke2RiQ29ubi5ob3N0fToke2RiQ29ubi5wb3J0fS8ke2RiQ29ubi5uYW1lfWAgfHwgJycsXG4gICAgICAgIHN0YXRlOiBkYkNvbm4gJiYgbW9uZ29vc2UuQ29ubmVjdGlvbi5TVEFURVNbZGJDb25uLl9yZWFkeVN0YXRlXSB8fCBudWxsLFxuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gXy5tZXJnZSh7fSwgd29ya2VyU3RhdHVzLCB0YXNrc1N0YXR1cywgZGJTdGF0dXMgKTtcbiAgfVxuXG4gIGFkZExvZ2dlclRyYW5zcG9ydCh0cmFuc3BvcnQsIG9wdGlvbnMpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcblxuICAgIGxldCBsb2dnZXIgPSBfbG9nZ2VyLmdldChzZWxmKTtcbiAgICBsb2dnZXIuYWRkKHRyYW5zcG9ydCwgb3B0aW9ucyk7XG4gICAgX2xvZ2dlci5zZXQoc2VsZiwgbG9nZ2VyKTtcbiAgfVxuXG4gIHJlbW92ZUxvZ2dlclRyYW5zcG9ydCh0cmFuc3BvcnQpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcblxuICAgIGxldCBsb2dnZXIgPSBfbG9nZ2VyLmdldChzZWxmKTtcbiAgICBsb2dnZXIucmVtb3ZlKHRyYW5zcG9ydCk7XG4gICAgX2xvZ2dlci5zZXQoc2VsZiwgbG9nZ2VyKTtcbiAgfVxuXG4gIGNvbm5lY3RNb25nb2RiKG1vbmdvVVJJLCBjYWxsYmFjaykge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGxldCBsb2cgPSBzZWxmLmxvZztcblxuICAgIGlmICghXy5pc0Z1bmN0aW9uKGNhbGxiYWNrKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3NlbGYubWV9LmNvbm5lY3RNb25nb2RiOiBDYWxsYmFjayBpcyBub3QgYSBmdW5jdGlvbmApXG4gICAgfVxuXG4gICAgbGV0IGRiQ29ubjtcbiAgICBsZXQgb3B0aW9ucyA9IHtyZXBsc2V0OiB7c29ja2V0T3B0aW9uczoge2Nvbm5lY3RUaW1lb3V0TVM6IDEwMDAwfX19O1xuICAgIGRiQ29ubiA9IG1vbmdvb3NlLmNyZWF0ZUNvbm5lY3Rpb24obW9uZ29VUkksIG9wdGlvbnMsIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgbG9nLmVycm9yKGAke3NlbGYubWV9LmRiQ29ubjogJHtlcnIubWVzc2FnZX1gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZy5pbmZvKGAke3NlbGYubWV9LmRiQ29ubjogQ29ubmVjdGlvbiBzdWNjZXNzZnVsYCk7XG4gICAgICB9XG4gICAgICBjYWxsYmFjayhlcnIpO1xuICAgIH0pO1xuICAgIGRiQ29ubi5vbignZXJyb3InLCBmdW5jdGlvbiAoZXJyKSB7ICAgLy8gYW55IGNvbm5lY3Rpb24gZXJyb3JzIHdpbGwgYmUgd3JpdHRlbiB0byB0aGUgY29uc29sZVxuICAgICAgbG9nLmVycm9yKGAke3NlbGYubWV9LmRiQ29ubjogJHtlcnIubWVzc2FnZX1gKTtcbiAgICB9KTtcblxuICAgIF9kYkNvbm4uc2V0KHNlbGYsIGRiQ29ubik7XG5cbiAgICBzZWxmLnJlZ2lzdGVyVGFzaygncmVmcmVzaFRhc2tDb25maWdzRnJvbURiJyk7XG5cbiAgICBjb25zdCB0YXNrQ29uZmlnU2NoZW1hID0ge1xuICAgICAgcmVmcmVzaEludGVydmFsTXM6IHtcbiAgICAgICAgdHlwZTogTnVtYmVyLFxuICAgICAgICBkZWZhdWx0OiAxMDAwLFxuICAgICAgfVxuICAgIH07XG4gICAgc2VsZi5zZXRFeHRlbmRlZFRhc2tDb25maWdTY2hlbWEoJ3JlZnJlc2hUYXNrQ29uZmlnc0Zyb21EYicsIHRhc2tDb25maWdTY2hlbWEpO1xuICAgIHJldHVybiBkYkNvbm47XG4gIH1cblxuICBzZXRFeHRlbmRlZFRhc2tDb25maWdTY2hlbWEodGFza05hbWUsIGNvbmZpZ1NjaGVtYSkge1xuICAgIF9zZXRUYXNrQ29uZmlnU2NoZW1hLmNhbGwodGhpcywgdGFza05hbWUsIGNvbmZpZ1NjaGVtYSk7XG4gIH1cblxuICBjaGFuZ2VUYXNrQ29uZmlnUGFyYW1ldGVycyh0YXNrTmFtZSwgY29uZmlnUGFyYW1ldGVyc1RvQ2hhbmdlID0ge30sIGNhbGxiYWNrKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICBpZiAoIV9nZXRUYXNrU3RhdHVzLmNhbGwoc2VsZiwgdGFza05hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7c2VsZi5tZX0uY2hhbmdlVGFza0NvbmZpZ1BhcmFtZXRlcnM6IFRhc2sgXCIke3Rhc2tOYW1lfVwiIGlzIG5vdCByZWdpc3RlcmVkYCk7XG4gICAgfVxuXG4gICAgaWYgKGNvbmZpZ1BhcmFtZXRlcnNUb0NoYW5nZS5oYXNPd25Qcm9wZXJ0eSgndGFza05hbWUnKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3NlbGYubWV9LmNoYW5nZVRhc2tDb25maWdQYXJhbWV0ZXJzOiBDYW5ub3QgY2hhbmdlIFwidGFza05hbWVcImApO1xuICAgIH1cblxuICAgIGxldCBjb25maWdTY2hlbWEgPSBfZ2V0VGFza0NvbmZpZ1NjaGVtYS5jYWxsKHNlbGYsIHRhc2tOYW1lKTtcbiAgICBpZiAoIWNvbmZpZ1NjaGVtYSkge1xuICAgICAgc2VsZi5zZXRFeHRlbmRlZFRhc2tDb25maWdTY2hlbWEodGFza05hbWUsIHt9KTtcbiAgICAgIGNvbmZpZ1NjaGVtYSA9IF9nZXRUYXNrQ29uZmlnU2NoZW1hLmNhbGwoc2VsZiwgdGFza05hbWUpO1xuICAgIH1cblxuICAgIGxldCBleGlzdGluZ1Rhc2tDb25maWcgPSBfZ2V0VGFza0NvbmZpZy5jYWxsKHNlbGYsIHRhc2tOYW1lKTtcbiAgICBsZXQgbmV3VGFza0NvbmZpZyA9IF8ubWVyZ2Uoe30sIGV4aXN0aW5nVGFza0NvbmZpZywgY29uZmlnUGFyYW1ldGVyc1RvQ2hhbmdlKTtcbiAgICBuZXdUYXNrQ29uZmlnID0gZ2V0T2JqZWN0RnJvbVNjaGVtYShjb25maWdTY2hlbWEsIG5ld1Rhc2tDb25maWcpO1xuXG4gICAgbGV0IGNoYW5nZWRQYXJhbWV0ZXJzID0gZGVlcERpZmYoZXhpc3RpbmdUYXNrQ29uZmlnLCBuZXdUYXNrQ29uZmlnKTtcblxuICAgIG5ld1Rhc2tDb25maWcuaGFzQmVlblNhdmVkdG9EYiA9IGV4aXN0aW5nVGFza0NvbmZpZy5oYXNCZWVuU2F2ZWR0b0RiO1xuICAgIGlmIChfLmlzRXF1YWwoZXhpc3RpbmdUYXNrQ29uZmlnLCBuZXdUYXNrQ29uZmlnKSAgJiYgZXhpc3RpbmdUYXNrQ29uZmlnLmhhc0JlZW5TYXZlZHRvRGIpICB7XG4gICAgICBfLmlzRnVuY3Rpb24oY2FsbGJhY2spICYmIGNhbGxiYWNrKG51bGwpO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgbmV3VGFza0NvbmZpZy5oYXNCZWVuU2F2ZWR0b0RiID0gZmFsc2U7XG4gICAgX3NhdmVUYXNrQ29uZmlnVG9EYXRhYmFzZS5jYWxsKHNlbGYsIG5ld1Rhc2tDb25maWcsIGNhbGxiYWNrKTtcblxuICAgIGxldCB0YXNrU3RhdGUgPSBfZ2V0VGFza1N0YXR1cy5jYWxsKHNlbGYsIHRhc2tOYW1lKS5zdGF0ZTtcblxuICAgIGlmIChjaGFuZ2VkUGFyYW1ldGVycy5zaG91bGRSdW4gPT09IHRydWUgJiYgKHRhc2tTdGF0ZSA9PT0gdGFza1NUQVRFUy5zdG9wcGVkIHx8IHRhc2tTdGF0ZSA9PT0gdGFza1NUQVRFUy5zdG9wcGluZykpIHtcbiAgICAgIHNlbGYucnVuVGFzayh0YXNrTmFtZSk7XG4gICAgfVxuXG4gICAgaWYgKGNoYW5nZWRQYXJhbWV0ZXJzLnNob3VsZFJ1biA9PT0gZmFsc2UgJiYgKHRhc2tTdGF0ZSA9PT0gdGFza1NUQVRFUy5ydW5uaW5nIHx8IHRhc2tTdGF0ZSA9PT0gdGFza1NUQVRFUy5kZWxheWVkKSkge1xuICAgICAgc2VsZi5zdG9wVGFzayh0YXNrTmFtZSk7XG4gICAgfVxuICB9XG5cbiAgcmVmcmVzaFRhc2tDb25maWdzRnJvbURiKG5leHQpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBsZXQgbG9nID0gc2VsZi5sb2c7XG5cbiAgICBsZXQgdGFza3MgPSBzZWxmLmdldFN0YXR1cygpLnRhc2tzO1xuICAgIGVhY2godGFza3MsXG4gICAgICBmdW5jdGlvbiAodGFzaywgY2FsbGJhY2spIHtcbiAgICAgICAgbGV0IHRhc2tOYW1lID0gdGFzay50YXNrTmFtZTtcbiAgICAgICAgbGV0IENvbmZpZ01vZGVsID0gX2dldFRhc2tDb25maWdNb2RlbC5jYWxsKHNlbGYsIHRhc2tOYW1lKTtcbiAgICAgICAgQ29uZmlnTW9kZWwuZmluZE9uZSh7IHRhc2tOYW1lOiB0YXNrTmFtZSB9KS5sZWFuKCkuc2V0T3B0aW9ucyh7IG1heFRpbWVNUyA6IDEwIH0pLmV4ZWMoZnVuY3Rpb24gKGVyciwgdGFza0NvbmZpZ0Zyb21EYikge1xuICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIGxvZy5lcnJvcihgJHtzZWxmLm1lfS5yZWZyZXNoVGFza0NvbmZpZ3NGcm9tRGIgJHtlcnIubWVzc2FnZX1gKTtcbiAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBsZXQgdGFza0NvbmZpZyA9IF9nZXRUYXNrQ29uZmlnLmNhbGwoc2VsZiwgdGFza05hbWUpO1xuICAgICAgICAgIGlmICh0YXNrQ29uZmlnRnJvbURiKSB7XG4gICAgICAgICAgICBsZXQgbmV3Q29uZmlnUGFyYW1ldGVycyA9IF8uY2xvbmVEZWVwKHRhc2tDb25maWdGcm9tRGIpO1xuICAgICAgICAgICAgZGVsZXRlIG5ld0NvbmZpZ1BhcmFtZXRlcnMudGFza05hbWU7XG4gICAgICAgICAgICBkZWxldGUgbmV3Q29uZmlnUGFyYW1ldGVycy5faWQ7XG4gICAgICAgICAgICBkZWxldGUgbmV3Q29uZmlnUGFyYW1ldGVycy5fX3Y7XG4gICAgICAgICAgICBkZWxldGUgbmV3Q29uZmlnUGFyYW1ldGVycy4kc2V0T25JbnNlcnQ7XG4gICAgICAgICAgICBzZWxmLmNoYW5nZVRhc2tDb25maWdQYXJhbWV0ZXJzKHRhc2tOYW1lLCBuZXdDb25maWdQYXJhbWV0ZXJzLCBjYWxsYmFjayk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIF9zYXZlVGFza0NvbmZpZ1RvRGF0YWJhc2UuY2FsbChzZWxmLCB0YXNrQ29uZmlnKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0sXG4gICAgICBmdW5jdGlvbiAoZXJyKXtcbiAgICAgICAgbGV0IHJlZnJlc2hJbnRlcnZhbE1zID0gX2dldFRhc2tDb25maWcuY2FsbChzZWxmLCAncmVmcmVzaFRhc2tDb25maWdzRnJvbURiJykucmVmcmVzaEludGVydmFsTXM7XG4gICAgICAgIG5leHQocmVmcmVzaEludGVydmFsTXMpO1xuICAgICAgfSk7XG4gIH1cbn1cbiJdfQ==