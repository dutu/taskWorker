'use strict';

import _ from 'lodash';
import ee from 'event-emitter';

import { _compileAllModels } from './taskConfigUtils.js';

import { deepDiff }from './utils';

let emitter = ee({});
let _tasksStatus = new WeakMap();

export const taskSTATES = {
  running: 'running',
  delayed: 'delayed',
  stopping: 'stopping',
  stopped: 'stopped',
};


export const _registerTask = function _registerTask(taskName) {
  const self = this;
  let tasksStatus = _tasksStatus.get(self) || [];
  const taskStatusIndex = _.findIndex(tasksStatus, { taskName: taskName });
  if (taskStatusIndex !== -1) {
    throw new Error(`${self.me}.registerTask: Task ${taskName} is already registered`);
  }

  tasksStatus.push({
    taskName: taskName,
    state: taskSTATES.stopped,
    lastRunAt: new Date(0),
    delayedMS: null,
    timeoutId: null,
    next:null,
  });

  _tasksStatus.set(self, tasksStatus);
};

export const _getTaskStatus = function _getTaskStatus(taskName) {
  const self = this;

  let tasksStatus = _getAllTasksStatus.call(self);
  const taskStatusIndex = _.findIndex(tasksStatus, { taskName: taskName });
  if (taskStatusIndex > -1) {
    return tasksStatus[taskStatusIndex];
  } else {
    return null;
  }
};

export const _setTaskStatus = function _setTaskStatus(status) {
  const self = this;

  const tasksStatus = _tasksStatus.get(self) || [];
  const taskName = status.taskName;
  const taskStatusIndex = _.findIndex(tasksStatus, { taskName: taskName });
  if (taskStatusIndex === -1) {
    throw new Error(`${self.me}.setTaskStatus: Task ${taskName} is not registered`);
  }

  tasksStatus[taskStatusIndex] = status;
  _tasksStatus.set(self, tasksStatus);
};

export const _getAllTasksStatus = function _getAllTasksStatus() {
  const self = this;
  let result = _tasksStatus.get(self);
  return  result || [];
};

