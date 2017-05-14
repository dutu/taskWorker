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
            log.error(self.me + '.' + taskName + '.refreshTaskConfigsFromDb ' + err.message);
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
//# sourceMappingURL=index.js.map