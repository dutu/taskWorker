'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports._getAllTasksStatus = exports._setTaskStatus = exports._getTaskStatus = exports._registerTask = exports.taskSTATES = undefined;

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _eventEmitter = require('event-emitter');

var _eventEmitter2 = _interopRequireDefault(_eventEmitter);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var emitter = (0, _eventEmitter2.default)({});
var _tasksStatus = new WeakMap();

var taskSTATES = exports.taskSTATES = {
  running: 'running',
  delayed: 'delayed',
  stopping: 'stopping',
  stopped: 'stopped'
};

var _registerTask = exports._registerTask = function _registerTask(taskName) {
  var self = this;
  var tasksStatus = _tasksStatus.get(self) || [];
  var taskStatusIndex = _lodash2.default.findIndex(tasksStatus, { taskName: taskName });
  if (taskStatusIndex !== -1) {
    throw new Error(self.me + '.registerTask: Task ' + taskName + ' is already registered');
  }

  tasksStatus.push({
    taskName: taskName,
    state: taskSTATES.stopped,
    lastRunAt: new Date(0),
    delayedMS: null,
    timeoutId: null,
    next: null
  });

  _tasksStatus.set(self, tasksStatus);
};

var _getTaskStatus = exports._getTaskStatus = function _getTaskStatus(taskName) {
  var self = this;

  var tasksStatus = _getAllTasksStatus.call(self);
  var taskStatusIndex = _lodash2.default.findIndex(tasksStatus, { taskName: taskName });
  if (taskStatusIndex > -1) {
    return tasksStatus[taskStatusIndex];
  } else {
    return null;
  }
};

var _setTaskStatus = exports._setTaskStatus = function _setTaskStatus(status) {
  var self = this;

  var tasksStatus = _tasksStatus.get(self) || [];
  var taskName = status.taskName;
  var taskStatusIndex = _lodash2.default.findIndex(tasksStatus, { taskName: taskName });
  if (taskStatusIndex === -1) {
    throw new Error(self.me + '.setTaskStatus: Task ' + taskName + ' is not registered');
  }

  tasksStatus[taskStatusIndex] = status;
  _tasksStatus.set(self, tasksStatus);
};

var _getAllTasksStatus = exports._getAllTasksStatus = function _getAllTasksStatus() {
  var self = this;
  var result = _tasksStatus.get(self);
  return result || [];
};
//# sourceMappingURL=taskStateUtils.js.map