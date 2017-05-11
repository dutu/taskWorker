'use strict';

import _ from 'lodash';
import chai from 'chai';
const expect = chai.expect;

import { TaskWorker} from '../src/index.js';

class Worker extends TaskWorker {
  constructor(workerName) {
    super(workerName);
  }

  firstTask(next) {
  }

  secondTask(next) {
  }
}

describe("Constructor", function () {
  let worker = new TaskWorker('worker');
  it('should create a new instance', function () {
    expect(worker).to.be.an.instanceOf(TaskWorker);
  });

  it('should have correct properties', function () {
    let worker = new TaskWorker('worker');
    expect(worker).to.have.deep.property('me');
    expect(worker.me).to.be.a('string').that.equal('worker');
  });

  it('should be an extendable class', function (done) {
    class ChildWorker extends TaskWorker {
      constructor(workerName) {
        super(workerName);
      }
    }
    let worker = new ChildWorker(('ChildWorker'));
    expect(worker).to.have.deep.property("me");
    expect(worker.me).to.be.a("string");
    expect(worker).to.be.an.instanceOf(TaskWorker);
    expect(worker).to.be.an.instanceOf(ChildWorker);
    done();
  });
});

describe('Methods', function () {
  [
    'registerTask',
    'runTask',
    'stopTask',
    'stopAllTasks',
    'getStatus',
    'addLoggerTransport',
    'removeLoggerTransport',
    'connectMongodb',
    'setExtendedTaskConfigSchema',
    'changeTaskConfigParameters',
    'refreshTaskConfigsFromDb',
  ].forEach(method => {
    it(`'${method}' should respond when called`, function () {
      let worker = new TaskWorker('worker');
      expect(worker).to.respondTo(method);
    });
  });

  let worker = new TaskWorker('worker');
  _.forEach(worker.log, function (value, key) {
    it(`'log.${key}' should be a function`, function () {
      expect(worker.log[key]).to.be.a('function');
    });
  });

});

describe("registerTask()", function () {
  it(`should register a task`, function (done) {
    let worker = new Worker('integrationTestWorker');
    let fn = function() { worker.registerTask('firstTask'); };
    expect(fn).not.to.throw(Error);
    done();
  });
  it(`should set default parameters`, function (done) {
    let worker = new Worker('integrationTestWorker');
    let status = worker.getStatus();
    expect(status).to.have.deep.property('worker.restartedAt').that.is.a('date');
    expect(status).to.have.property('tasks').that.have.length(0);
    worker.registerTask('firstTask');
    status = worker.getStatus();
    expect(status).to.have.deep.property('worker.restartedAt').that.is.a('date');
    expect(status).to.have.property('tasks').that.have.length(1);
    expect(status.tasks[0].taskName).to.equal('firstTask');
    expect(status.tasks[0].startedAt).to.be.a('date');
    expect(status.tasks[0].state).to.equal('stopped');
    expect(status.tasks[0].lastRunAt).to.be.a('date');
    expect(status.tasks[0].delayedMS).to.equal(null);
    expect(status.dbConnection.state).to.be.null;
    done();
  });
  it(`should throw error if task is registered twice`, function (done) {
    let worker = new Worker('integrationTestWorker');
    worker.registerTask('firstTask');
    let fn = function() { worker.registerTask('firstTask'); };
    expect(fn).to.throw('integrationTestWorker.registerTask: Task firstTask is already registered');
    done();
  });
  it(`should throw error if task is not an object method`, function (done) {
    let worker = new Worker('integrationTestWorker');
    let fn = function() { worker.registerTask('notExisting'); };
    expect(fn).to.throw('integrationTestWorker.registerTask: Task notExisting is not a method of this object');
    done();
  });
});

describe("getStatus()", function () {
  it(`getStatus() should return task status with default parameters`, function (done) {
    let worker = new Worker('integrationTestWorker');
    let status = worker.getStatus();
    expect(status).to.have.deep.property('worker.restartedAt').that.is.a('date');
    expect(status).to.have.property('tasks').that.have.length(0);
    worker.registerTask('firstTask');
    status = worker.getStatus();
    expect(status).to.have.deep.property('worker.restartedAt').that.is.a('date');
    expect(status).to.have.property('tasks').that.have.length(1);
    expect(status.tasks[0].taskName).to.equal('firstTask');
    expect(status.tasks[0].startedAt).to.be.a('date');
    expect(status.tasks[0].state).to.equal('stopped');
    expect(status.tasks[0].lastRunAt).to.be.a('date');
    expect(status.tasks[0].delayedMS).to.equal(null);
    expect(status.dbConnection.state).to.be.null;
    done();
  });
});

describe("setExtendedTaskConfigSchema()", function () {
  it(`should throw error if task not registered`, function (done) {
    let worker = new Worker('integrationTestWorker');
    let defaultValue = 'default value';
    let extendedSchema = {
      newConfigParameter: {
        type: String,
        default: defaultValue,
      },
    };
    let fn = function() { worker.setExtendedTaskConfigSchema('firstTask', extendedSchema); };
    expect(fn).to.throw('integrationTestWorker.setExtendedTaskConfigSchema: Task "firstTask" is not registered');
    done();
  });
  it(`should set default parameters`, function (done) {
    let worker = new Worker('integrationTestWorker');
    worker.registerTask('firstTask');
    let defaultValue = 'default value';
    let extendedSchema = {
      newConfigParameter: {
        type: String,
        default: defaultValue,
      },
    };
    worker.setExtendedTaskConfigSchema('firstTask', extendedSchema);
    let status = worker.getStatus();
    expect(status).to.have.deep.property('worker.restartedAt').that.is.a('date');
    expect(status).to.have.property('tasks').that.have.length(1);
    expect(status.tasks[0].taskName).to.equal('firstTask');
    expect(status.tasks[0].startedAt).to.be.a('date');
    expect(status.tasks[0].state).to.equal('stopped');
    expect(status.tasks[0].lastRunAt).to.be.a('date');
    expect(status.tasks[0].delayedMS).to.equal(null);
    expect(status).to.have.deep.property('dbConnection.state');
    expect(status.dbConnection.state).to.be.null;
    expect(status.tasks[0]).to.have.property('newConfigParameter');
    expect(status.tasks[0].newConfigParameter).to.be.equal(defaultValue);
    done();
  });
  it(`should change schema twice`, function (done) {
    let worker = new Worker('integrationTestWorker');
    worker.registerTask('firstTask');
    let defaultValue = 'default value';
    let extendedSchema = {
      newConfigParameter: {
        type: String,
        default: defaultValue,
      },
    };
    worker.setExtendedTaskConfigSchema('firstTask', extendedSchema);
    status = worker.getStatus();
    expect(status).to.have.deep.property('worker.restartedAt').that.is.a('date');
    expect(status).to.have.property('tasks').that.have.length(1);
    expect(status.tasks[0].taskName).to.equal('firstTask');
    expect(status.tasks[0].startedAt).to.be.a('date');
    expect(status.tasks[0].state).to.equal('stopped');
    expect(status.tasks[0].lastRunAt).to.be.a('date');
    expect(status.tasks[0].delayedMS).to.equal(null);
    expect(status).to.have.deep.property('dbConnection.state');
    expect(status.dbConnection.state).to.be.null;
    expect(status.tasks[0]).to.have.property('newConfigParameter');
    expect(status.tasks[0].newConfigParameter).to.be.equal(defaultValue);

    extendedSchema = {
      otherNewConfigParameter: {
        type: String,
        default: 'otherDefaultValue',
      },
    };
    worker.setExtendedTaskConfigSchema('firstTask', extendedSchema);
    let status = worker.getStatus();
    expect(status).to.have.deep.property('worker.restartedAt').that.is.a('date');
    expect(status).to.have.property('tasks').that.have.length(1);
    expect(status.tasks[0].taskName).to.equal('firstTask');
    expect(status.tasks[0].startedAt).to.be.a('date');
    expect(status.tasks[0].state).to.equal('stopped');
    expect(status.tasks[0].lastRunAt).to.be.a('date');
    expect(status.tasks[0].delayedMS).to.equal(null);
    expect(status).to.have.deep.property('dbConnection.state');
    expect(status.dbConnection.state).to.be.null;
    expect(status.tasks[0]).not.to.have.property('newConfigParameter');
    expect(status.tasks[0]).to.have.property('otherNewConfigParameter');
    expect(status.tasks[0].otherNewConfigParameter).to.be.equal('otherDefaultValue');
    done();
  });
});

describe("changeTaskConfigParameters() - when not connected to mongoDb", function () {
  it(`should throw error if task not registered`, function (done) {
    let worker = new Worker('integrationTestWorker');
    let fn = function() { worker.changeTaskConfigParameters('firstTask', {}); };
    expect(fn).to.throw('integrationTestWorker.changeTaskConfigParameters: Task "firstTask" is not registered');
    done();
  });
  it(`should throw error if trying to change "taskName" parameter`, function (done) {
    let worker = new Worker('integrationTestWorker');
    worker.registerTask('firstTask');
    let fn = function() { worker.changeTaskConfigParameters('firstTask', {taskName: "newValue"}); };
    expect(fn).to.throw('integrationTestWorker.changeTaskConfigParameters: Cannot change "taskName"');
    done();
  });
  it(`should change basic parameter`, function (done) {
    let worker = new Worker('integrationTestWorker');
    worker.registerTask('firstTask');
    worker.changeTaskConfigParameters('firstTask', { startedAt: '2015-12-24' });
    let startedAt = worker.getStatus().tasks[0].startedAt;
    expect(startedAt).to.be.a('date');
    expect(startedAt.valueOf()).to.equal(new Date('2015-12-24').valueOf());
    done();
  });
  it(`should change extended parameter`, function (done) {
    let worker = new Worker('integrationTestWorker');
    worker.registerTask('firstTask');
    let extendedSchema = {
      newConfigParameter: {
        type: String,
        default: 'defaultValue',
      },
    };
    worker.setExtendedTaskConfigSchema('firstTask', extendedSchema);
    let status = worker.getStatus();
    expect(status.tasks[0].newConfigParameter).to.be.equal('defaultValue');
    worker.changeTaskConfigParameters('firstTask', { newConfigParameter: 'newValue' });
    status = worker.getStatus();
    expect(status.tasks[0].newConfigParameter).to.be.equal('newValue');
    done();
  });
  it(`should change parameter keeping previously changed parameters`, function (done) {
    let worker = new Worker('integrationTestWorker');
    worker.registerTask('firstTask');
    let extendedSchema = {
      newConfigParameter: {
        type: String,
        default: 'defaultValue',
      },
      newConfigParameter2: {
        type: String,
        default: 'defaultValue2',
      },
    };
    worker.setExtendedTaskConfigSchema('firstTask', extendedSchema);
    let status = worker.getStatus();
    expect(status.tasks[0].newConfigParameter).to.be.equal('defaultValue');
    expect(status.tasks[0].newConfigParameter2).to.be.equal('defaultValue2');

    worker.changeTaskConfigParameters('firstTask', { newConfigParameter: 'newValue' });
    status = worker.getStatus();
    expect(status.tasks[0].newConfigParameter).to.be.equal('newValue');
    expect(status.tasks[0].newConfigParameter2).to.be.equal('defaultValue2');

    worker.changeTaskConfigParameters('firstTask', { newConfigParameter2: 'newValue2' });
    status = worker.getStatus();
    expect(status.tasks[0].newConfigParameter).to.be.equal('newValue');
    expect(status.tasks[0].newConfigParameter2).to.be.equal('newValue2');
    done();
  });
  it(`should ignore parameters not defined in the schema`, function (done) {
    let worker = new Worker('integrationTestWorker');
    worker.registerTask('firstTask');
    let extendedSchema = {
      newConfigParameter: {
        type: String,
        default: 'defaultValue',
      },
    };
    worker.setExtendedTaskConfigSchema('firstTask', extendedSchema);
    let status = worker.getStatus();
    expect(status.tasks[0].newConfigParameter).to.be.equal('defaultValue');

    worker.changeTaskConfigParameters('firstTask', { invalidParameter: 'anyValue' });
    status = worker.getStatus();
    expect(status.tasks[0].newConfigParameter).to.be.equal('defaultValue');
    expect(status.tasks[0]).not.to.have.property('invalidParameter');

    worker.changeTaskConfigParameters('firstTask', { newConfigParameter: 'newValue' });
    status = worker.getStatus();
    expect(status.tasks[0].newConfigParameter).to.be.equal('newValue');

    worker.changeTaskConfigParameters('firstTask', { invalidParameter: 'anyValue' });
    status = worker.getStatus();
    expect(status.tasks[0].newConfigParameter).to.be.equal('newValue');
    expect(status.tasks[0]).not.to.have.property('invalidParameter');

    worker.changeTaskConfigParameters('firstTask', { newConfigParameter: 'otherValue', invalidParameter: 'anyValue' });
    status = worker.getStatus();
    expect(status.tasks[0].newConfigParameter).to.be.equal('otherValue');
    expect(status.tasks[0]).not.to.have.property('invalidParameter');

    worker.changeTaskConfigParameters('firstTask', {});
    status = worker.getStatus();
    expect(status.tasks[0].newConfigParameter).to.be.equal('otherValue');
    expect(status.tasks[0]).not.to.have.property('invalidParameter');

    worker.changeTaskConfigParameters('firstTask');
    status = worker.getStatus();
    expect(status.tasks[0].newConfigParameter).to.be.equal('otherValue');
    expect(status.tasks[0]).not.to.have.property('invalidParameter');

    done();
  });
  it(`should accept callback and pass no error`, function (done) {
    let worker = new Worker('integrationTestWorker');
    worker.registerTask('firstTask');
    let extendedSchema = {
      newConfigParameter: {
        type: String,
        default: 'defaultValue',
      },
    };
    worker.setExtendedTaskConfigSchema('firstTask', extendedSchema);
    let status = worker.getStatus();
    expect(status.tasks[0].newConfigParameter).to.be.equal('defaultValue');
    worker.changeTaskConfigParameters('firstTask', { newConfigParameter: 'newValue' }, function (err) {
      expect(err).to.be.null;
      status = worker.getStatus();
      expect(status.tasks[0].newConfigParameter).to.be.equal('newValue');
      done();
    });
  });
});

describe('runTask()', function () {
  it(`should throw error if task is not registered`, function (done) {
    let worker = new TaskWorker('integrationTestWorker');
    let fn = function() { worker.runTask('firstTask'); };
    expect(fn).to.throw('integrationTestWorker.runTask: Task firstTask is not registered');
    fn = function() { worker.runTask('dummyTask1'); };
    expect(fn).to.throw(Error);
    done();
  });
  it(`should start a stopped task`, function (done) {
    class ChildWorker extends TaskWorker {
      constructor(workerName) {
        super(workerName);
      }
      firstTask(next) {
        next(null);
        done();
      }
    }
    let worker = new ChildWorker('ChildWorker');
    worker.registerTask('firstTask');
    worker.runTask('firstTask');
  });
  it(`should start task and change to "delayed"`, function (done) {
    class ChildWorker extends TaskWorker {
      constructor(workerName) {
        super(workerName);
      }
      firstTask(next) {
        next(10000);
      }
    }
    let worker = new ChildWorker(('ChildWorker'));
    worker.registerTask("firstTask");
    worker.runTask("firstTask");
    setTimeout(function() {
      let status = worker.getStatus('firstTask');
      expect(status.tasks[0].state).to.equal('delayed');
      done();
    },100)
  });
  it(`should start task and change to "executing"`, function (done) {
    class ChildWorker extends TaskWorker {
      constructor(workerName) {
        super(workerName);
      }
      firstTask(next) {
        let n = _.bind(next, this, 100);
        setTimeout(n, 10000);
      }
    }
    let worker = new ChildWorker(('ChildWorker'));
    worker.registerTask("firstTask");
    worker.runTask("firstTask");
    setTimeout(function() {
      let status = worker.getStatus('firstTask');
      expect(status.tasks[0].state).to.equal('running');
      done();
    },100)
  });
  it(`should ignore an "executing" task`, function (done) {
    class ChildWorker extends TaskWorker {
      constructor(workerName) {
        super(workerName);
      }
      firstTask(next) {
        let n = _.bind(next, this, 100);
        setTimeout(n, 10000);
      }
    }
    let worker = new ChildWorker(('ChildWorker'));
    worker.registerTask("firstTask");
    worker.runTask("firstTask");
    setTimeout(function() {
      let status = worker.getStatus('firstTask');
      expect(status.tasks[0].state).to.equal('running');
      worker.runTask("firstTask");
      status = worker.getStatus('firstTask');
      expect(status.tasks[0].state).to.equal('running');
      done();
    },100)
  });
  it(`should execute "delayed" task immediately`, function (done) {
    let times = 0;
    class ChildWorker extends TaskWorker {
      constructor(workerName) {
        super(workerName);
      }
      firstTask(next) {
        times++;
        next(100000);
      }
    }
    let worker = new ChildWorker(('ChildWorker'));
    worker.registerTask("firstTask");
    worker.runTask("firstTask");
    setTimeout(function() {
      let status = worker.getStatus('firstTask');
      expect(status.tasks[0].state).to.equal('delayed');
      worker.runTask("firstTask");
      status = worker.getStatus('firstTask');
      expect(status.tasks[0].state).to.equal('delayed');
      expect(times).to.equal(2);
      done();
    },100)
  });
  it(`should execute the callback after the task stops`, function (done) {
    let times = 0;
    class ChildWorker extends TaskWorker {
      constructor(workerName) {
        super(workerName);
      }
      firstTask(next) {
        times++;
        if (times < 2) {
          next(10);
        } else {
          next(null);
        }
      }
    }
    let worker = new ChildWorker(('ChildWorker'));
    worker.registerTask("firstTask");
    worker.runTask("firstTask", function() {
      let status = worker.getStatus('firstTask');
      expect(status.tasks[0].state).to.equal('stopped');
      expect(times).to.equal(2);
      done();
    });
  });
  it(`should execute the callback in object's context`, function (done) {
    let times = 0;
    class ChildWorker extends TaskWorker {
      constructor(workerName) {
        super(workerName);
        this.myContext = "isThis";
      }
      firstTask(next) {
        times++;
        if (times < 2) {
          next(10);
        } else {
          next(null);
        }
      }
    }
    let worker = new ChildWorker(('ChildWorker'));
    worker.registerTask("firstTask");
    worker.runTask("firstTask", function() {
      let self = this;
      let status = worker.getStatus('firstTask');
      expect(status.tasks[0].state).to.equal('stopped');
      expect(times).to.equal(2);
      expect(self.myContext).to.equal("isThis");
      done();
    });
  });
});

describe('task(next) - calling next()', function () {
  it(`"next(null)" should not re-run the task`, function (done) {
    let times = 0;
    class ChildWorker extends TaskWorker {
      constructor(workerName) {
        super(workerName);
      }
      firstTask(next) {
        times++;
        next(null)
      }
    }
    let worker = new ChildWorker(('ChildWorker'));
    worker.registerTask("firstTask");
    worker.runTask("firstTask");
    setTimeout(function() {
      expect(times).to.equal(1);
      let status = worker.getStatus('firstTask');
      expect(status.tasks[0].state).to.equal('stopped');
      done();
    },100)
  });
  it(`"next(0)" should re-run the task`, function (done) {
    let times = 0;
    class ChildWorker extends TaskWorker {
      constructor(workerName) {
        super(workerName);
      }
      firstTask(next) {
        times++;
        if (times === 10) {
          next(null);
        } else {
          next(0)
        }
      }
    }
    let worker = new ChildWorker(('ChildWorker'));
    worker.registerTask("firstTask");
    worker.runTask("firstTask");
    setTimeout(function() {
      expect(times).to.equal(10);
      let status = worker.getStatus('firstTask');
      expect(status.tasks[0].state).to.equal('stopped');
      done();
    },100)
  });
  it(`"next(1)" should re-run the task`, function (done) {
    let times = 0;
    class ChildWorker extends TaskWorker {
      constructor(workerName) {
        super(workerName);
      }
      firstTask(next) {
        times++;
        if (times === 10) {
          next(null);
        } else {
          next(0);
        }
      }
    }
    let worker = new ChildWorker(('ChildWorker'));
    worker.registerTask("firstTask");
    worker.runTask("firstTask");
    setTimeout(function() {
      expect(times).to.equal(10);
      let status = worker.getStatus('firstTask');
      expect(status.tasks[0].state).to.equal('stopped');
      done();
    },100)
  });
  it(`"next('string')" should throw an Error`, function (done) {
    let times = 0;
    class ChildWorker extends TaskWorker {
      constructor(workerName) {
        super(workerName);
      }
      firstTask(next) {
        times++;
        next("string");
      }
    }
    let worker = new ChildWorker(('ChildWorker'));
    worker.registerTask("firstTask");
    let fn = function() { worker.runTask("firstTask"); };
    setTimeout(function() {
      expect(fn).to.throw('ChildWorker.firstTask: next() called with wrong parameter type (string)');
      done();
    },100)
  });
});

describe('stoptTask()', function () {
  it(`should not throw error if no task is registered`, function (done) {
    let worker = new TaskWorker('integrationTestWorker');
    let fn = function() { worker.stopAllTasks(); };
    expect(fn).not.to.throw(Error);
    done();
  });
  it(`should stop all (3) tasks`, function (done) {
    class ChildWorker extends TaskWorker {
      constructor(workerName) {
        super(workerName);
      }

      firstTask(next) {
        next(1);
      }

      secondtTask(next) {
        next(10000);
      }

      thirdTask(next) {
        let n = _.bind(next, this, 1000);
        setTimeout(n, 500);
      }
    }
    let worker = new ChildWorker('integrationTestWorker');
    worker.registerTask("firstTask");
    worker.registerTask("secondtTask");
    worker.registerTask("thirdTask");
    worker.runTask("firstTask");
    worker.runTask("secondtTask");
    worker.runTask("thirdTask");
    setTimeout(function () {
      let status = worker.getStatus('secondtTask');
      expect(status.tasks[1].state).to.equal('delayed');
      status = worker.getStatus('thirdTask');
      expect(status.tasks[2].state).to.equal('running');
      worker.stopAllTasks();
      setTimeout(function () {
        let status = worker.getStatus('firstTask');
        expect(status.tasks[0].state).to.equal('stopped');
        status = worker.getStatus('secondtTask');
        expect(status.tasks[1].state).to.equal('stopped');
        status = worker.getStatus('thirdTask');
        expect(status.tasks[1].state).to.equal('stopped');
        done();
      },300);
    });
  });
});



