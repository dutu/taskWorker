'use strict';

import _ from 'lodash';
import { doWhilst, each } from 'async';
import mongoose from 'mongoose';
import winston from 'winston';
import ee from 'event-emitter';

import { getObjectFromSchema, deepDiff }from './lib/utils';
import { _registerTask, _getTaskStatus, _setTaskStatus, _getAllTasksStatus, taskSTATES } from './lib/taskStateUtils';
import { _setTaskConfigSchema, _getTaskConfigSchema, _getTaskConfigModels, _getTaskConfigModel, _compileTaskConfigModels, _getTaskConfig, _setTaskConfig, _saveTaskConfigToDatabase, _dbConn} from './lib/taskConfigUtils.js';

let emitter = ee({});
let _status = new WeakMap();
let _logger = new WeakMap();

export class TaskWorker {
  constructor(workerName) {
    let self  = this;
    self.me = workerName;

    let logger = new (winston.Logger)({
      transports: [
        new (winston.transports.Console)({
          colorize: true,
          level: 'debug',
        })
      ],
    });
    logger.setLevels(winston.config.syslog.levels);
    _logger.set(self, logger);

    self.log = {};
    ['emerg', 'alert', 'crit', 'error', 'warning', 'notice', 'info', 'debug'].forEach(level => {
      self.log[level] = _.bind(logger[level], self);
    });

    _status.set(self, {
      worker: {
        restartedAt: new Date(),
      },
    });
  }

  registerTask(taskName) {
    const self = this;

    if (!_.isFunction(self[taskName])) {
      throw new Error(`${self.me}.registerTask: Task ${taskName} is not a method of this object`);
    }

    _registerTask.call(self, taskName);
    self.setExtendedTaskConfigSchema(taskName, {});
  }

  runTask(taskName, callbackAfterStopped) {
    const self = this;
    const getTaskStatus = _.bind(_getTaskStatus, self);
    const setTaskStatus = _.bind(_setTaskStatus, self);

    let taskStatus = getTaskStatus(taskName);
    if(_.isNull(taskStatus)) {
      throw new Error(`${self.me}.runTask: Task ${taskName} is not registered`);
    }

    const taskFunction = _.bind(self[taskName], self);

    if (taskStatus.state === taskSTATES.running || taskStatus.state === taskSTATES.stopping) {
      return null;
    }

    if (taskStatus.state === taskSTATES.delayed) {
      if (_.isFunction(taskStatus.next)) {
        clearTimeout(taskStatus.timeoutId);
        taskStatus.next();
        return null;
      } else {
        throw new Error (`${self.me}.runTask: next is ${taskStatus.next} (not a function)`)
      }
    }

    let newTaskStatus = {
      taskName: taskName,
      state: taskSTATES.running,
      lastRunAt: new Date(),
      delayedMS: null,
      timeoutId: null,
      next:null,
    };
    setTaskStatus(newTaskStatus);

    self.changeTaskConfigParameters(taskName, { shouldRun: true });

    doWhilst(
      function(callback) {
        let newTaskStatus = {
          taskName: taskName,
          state: taskSTATES.running,
          lastRunAt: new Date(),
          delayedMS: null,
          timeoutId: null,
          next:null,
        };
        setTaskStatus(newTaskStatus);
        // self.changeTaskConfigParameters(taskName, { shouldRun: true });

        taskFunction(function(delayMS) {
          let taskStatus = getTaskStatus(taskName);
          if (taskStatus.state === taskSTATES.delayed || taskStatus.state === taskSTATES.stopped) {
            throw new Error (`${self.me}.runTask: Unexpected taskState["${taskName}"] = "${taskStatus.state}"`)
          }

          if(!(_.isNumber(delayMS) || _.isNull(delayMS))) {
            throw new Error (`${self.me}.${taskName}: next() called with wrong parameter type (${typeof delayMS})`);
          }

          if(_.isNumber(delayMS) && taskStatus.state === taskSTATES.running) {
            let next = _.bind(callback, self);
            let newTaskStatus = {
              taskName: taskName,
              state: taskSTATES.delayed,
              lastRunAt: taskStatus.lastRunAt,
              delayedMS: delayMS,
              timeoutId: setTimeout(next, delayMS),
              next: _.bind(callback, this),
            };
            setTaskStatus(newTaskStatus);
//            self.changeTaskConfigParameters(taskName, { shouldRun: true });
          } else {
            let newTaskStatus = {
              taskName: taskName,
              state: taskSTATES.stopping,
              lastRunAt: taskStatus.lastRunAt,
              delayedMS: null,
              timeoutId: null,
              next: null,
            };
            setTaskStatus(newTaskStatus);
//            self.changeTaskConfigParameters(taskName, { shouldRun: false });
            callback();
          }
        })
      },
      function() {
        let taskStatus = getTaskStatus(taskName);
        switch(taskStatus.state) {
          case taskSTATES.delayed:
            return true;
          case taskSTATES.stopping:
            return false;
          default:
            throw new Error (`${self.me}.runTask: Unexpected taskState["${taskName}"] ${taskStatus.state} )`)
        }
      },
      function(err, results) {
        if (err) {
          throw (err);
        }

        let newTaskStatus = {
          taskName: taskName,
          state: taskSTATES.stopped,
          lastRunAt: taskStatus.lastRunAt,
          delayedMS: null,
          timeoutId: null,
          next: null,
        };
        setTaskStatus(newTaskStatus);
        //self.changeTaskConfigParameters(taskName, { shouldRun: false });

        if (_.isFunction(callbackAfterStopped)) {
          callbackAfterStopped.call(self);
        }
      }
    );
  }

  stopTask(taskName) {
    const self = this;
    const getTaskStatus = _.bind(_getTaskStatus, self);
    const setTaskStatus = _.bind(_setTaskStatus, self);

    let taskStatus = getTaskStatus(taskName);
    if(_.isNull(taskStatus)) {
      throw new Error(`${self.me}.stopTask: Task ${taskName} is not registered`);
    }

    switch(taskStatus.state) {
      case taskSTATES.stopped:
      case taskSTATES.stopping: {
        self.changeTaskConfigParameters(taskName, { shouldRun: false });
        break;
      }
      case taskSTATES.delayed: {
        clearTimeout(taskStatus.timeoutId);
        let newTaskStatus = {
          taskName: taskName,
          state: taskSTATES.stopping,
          lastRunAt: taskStatus.lastRunAt,
          delayedMS: null,
          timeoutId: null,
          next: null,
        };
        setTaskStatus(newTaskStatus);
        self.changeTaskConfigParameters(taskName, { shouldRun: false });
        taskStatus.next();
        break;
      }
      case taskSTATES.running: {
        let newTaskStatus = {
          taskName: taskName,
          state: taskSTATES.stopping,
          lastRunAt: taskStatus.lastRunAt,
          delayedMS: taskStatus.delayedMS,
          timeoutId: taskStatus.timeoutId,
          next: taskStatus.next,
        };
        setTaskStatus(newTaskStatus);
        self.changeTaskConfigParameters(taskName, { shouldRun: false });
        break;
      }
      default: {
        throw new Error(`${self.me}.stopTask: Unrecognized task state ${taskStatus.state}`);
      }
    }
  }

  stopAllTasks() {
    const self = this;
    const getAllTasksStatus = _.bind(_getAllTasksStatus, self);


    const allTasksStatus = getAllTasksStatus();

    allTasksStatus.forEach(task => {
      self.stopTask(task.taskName);
    })
  }

  getStatus() {
    const self = this;

    let workerStatus = _status.get(self);

    let allTasksStatus = _getAllTasksStatus.call(self);
    let tasksStatus = {
      tasks: allTasksStatus.map(taskStatus => {
        let taskConfig = _getTaskConfig.call(self, taskStatus.taskName);
        let result = {
          state: taskStatus.state,
          lastRunAt: taskStatus.lastRunAt,
          delayedMS: taskStatus.delayedMS,
        };
        _.merge(result, taskConfig);
        return result;
      }),
  };

    let dbConn = _dbConn.get(self);
    let dbStatus = {
      dbConnection: {
        mongodbURI: dbConn && `mongodb://${dbConn.user}:****@${dbConn.host}:${dbConn.port}/${dbConn.name}` || '',
        state: dbConn && mongoose.Connection.STATES[dbConn._readyState] || null,
      }
    };

    return _.merge({}, workerStatus, tasksStatus, dbStatus );
  }

  addLoggerTransport(transport, options) {
    const self = this;

    let logger = _logger.get(self);
    logger.add(transport, options);
    _logger.set(self, logger);
  }

  removeLoggerTransport(transport) {
    const self = this;

    let logger = _logger.get(self);
    logger.remove(transport);
    _logger.set(self, logger);
  }

  connectMongodb(mongoURI, callback) {
    const self = this;
    let log = self.log;

    if (!_.isFunction(callback)) {
      throw new Error(`${self.me}.connectMongodb: Callback is not a function`)
    }

    let dbConn;
    let options = {replset: {socketOptions: {connectTimeoutMS: 10000}}};
    dbConn = mongoose.createConnection(mongoURI, options, function (err) {
      if (err) {
        log.error(`${self.me}.dbConn: ${err.message}`);
      } else {
        log.info(`${self.me}.dbConn: Connection successful`);
      }
      callback(err);
    });
    dbConn.on('error', function (err) {   // any connection errors will be written to the console
      log.error(`${self.me}.dbConn: ${err.message}`);
    });

    _dbConn.set(self, dbConn);

    self.registerTask('refreshTaskConfigsFromDb');

    const taskConfigSchema = {
      refreshIntervalMs: {
        type: Number,
        default: 1000,
      }
    };
    self.setExtendedTaskConfigSchema('refreshTaskConfigsFromDb', taskConfigSchema);
    return dbConn;
  }

  setExtendedTaskConfigSchema(taskName, configSchema) {
    _setTaskConfigSchema.call(this, taskName, configSchema);
  }

  changeTaskConfigParameters(taskName, configParametersToChange = {}, callback) {
    const self = this;

    if (!_getTaskStatus.call(self, taskName)) {
      throw new Error(`${self.me}.changeTaskConfigParameters: Task "${taskName}" is not registered`);
    }

    if (configParametersToChange.hasOwnProperty('taskName')) {
      throw new Error(`${self.me}.changeTaskConfigParameters: Cannot change "taskName"`);
    }

    let configSchema = _getTaskConfigSchema.call(self, taskName);
    if (!configSchema) {
      self.setExtendedTaskConfigSchema(taskName, {});
      configSchema = _getTaskConfigSchema.call(self, taskName);
    }

    let existingTaskConfig = _getTaskConfig.call(self, taskName);
    let newTaskConfig = _.merge({}, existingTaskConfig, configParametersToChange);
    newTaskConfig = getObjectFromSchema(configSchema, newTaskConfig);

    let changedParameters = deepDiff(existingTaskConfig, newTaskConfig);

    newTaskConfig.hasBeenSavedtoDb = existingTaskConfig.hasBeenSavedtoDb;
    if (_.isEqual(existingTaskConfig, newTaskConfig)  && existingTaskConfig.hasBeenSavedtoDb)  {
      _.isFunction(callback) && callback(null);
      return null;
    }

    newTaskConfig.hasBeenSavedtoDb = false;
    _saveTaskConfigToDatabase.call(self, newTaskConfig, callback);

    let taskState = _getTaskStatus.call(self, taskName).state;

    if (changedParameters.shouldRun === true && (taskState === taskSTATES.stopped || taskState === taskSTATES.stopping)) {
      self.runTask(taskName);
    }

    if (changedParameters.shouldRun === false && (taskState === taskSTATES.running || taskState === taskSTATES.delayed)) {
      self.stopTask(taskName);
    }
  }

  refreshTaskConfigsFromDb(next) {
    const self = this;
    let log = self.log;

    let tasks = self.getStatus().tasks;
    each(tasks,
      function (task, callback) {
        let taskName = task.taskName;
        let ConfigModel = _getTaskConfigModel.call(self, taskName);
        ConfigModel.findOne({ taskName: taskName }).lean().setOptions({ maxTimeMS : 10 }).exec(function (err, taskConfigFromDb) {
          if (err) {
            log.error(`${self.me}.refreshTaskConfigsFromDb ${err.message}`);
            return callback(null);
          }

          let taskConfig = _getTaskConfig.call(self, taskName);
          if (taskConfigFromDb) {
            let newConfigParameters = _.cloneDeep(taskConfigFromDb);
            delete newConfigParameters.taskName;
            delete newConfigParameters._id;
            delete newConfigParameters.__v;
            delete newConfigParameters.$setOnInsert;
            self.changeTaskConfigParameters(taskName, newConfigParameters, callback);
          } else {
            _saveTaskConfigToDatabase.call(self, taskConfig);
            callback();
          }
        });
      },
      function (err){
        let refreshIntervalMs = _getTaskConfig.call(self, 'refreshTaskConfigsFromDb').refreshIntervalMs;
        next(refreshIntervalMs);
      });
  }
}
