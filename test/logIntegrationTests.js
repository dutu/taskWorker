'use strict';

import _ from 'lodash';
import winston from 'winston';
import chai from 'chai';
const expect = chai.expect;

import { TaskWorker, errl } from '../index.js';

describe('log()', function () {
  it(`should log all error levels`, function (done) {
    class Worker extends TaskWorker {
      constructor(workerName) {
        super(workerName);
      }
      firstTask(next) {
        let self = this;
        let log = self.log;
        ['emerg', 'alert', 'crit', 'error', 'warning', 'notice', 'info', 'debug'].forEach(level => {
          self.log[level](`${self.me}.firstTask: ${level} message`)
        });
        next(null);
        done();
      }
    }
    let worker = new Worker('testWorker');
    worker.registerTask('firstTask');
    worker.runTask('firstTask');
  });
});

describe('addLoggerTransport()', function () {
  it(`should add a transport`, function (done) {
    class Worker extends TaskWorker {
      constructor(workerName) {
        super(workerName);
      }
      firstTask(next) {
        let self = this;
        let log = self.log;
        let fn = function () { log.error(`${self.me}: error message`); };
        expect(fn).to.not.throw(Error);
        done();
      }
    }
    let worker = new Worker('testWorker');
    worker.registerTask('firstTask');
    worker.addLoggerTransport(winston.transports.File, { name: 'error-file', filename: `filelog-error.log`, 'timestamp':false });
    worker.runTask('firstTask');
  });
});

describe('removeLoggerTransport()', function () {
  it(`should remove transport`, function (done) {
    class Worker extends TaskWorker {
      constructor(workerName) {
        super(workerName);
      }
      firstTask(next) {
        let self = this;
        let log = self.log;
        let fn = function () { log.error(`${self.me}: error message`); };
        expect(fn).to.not.throw(Error);
        next(null);
      }
    }
    let worker = new Worker('testWorker');
    worker.registerTask('firstTask');
    worker.addLoggerTransport(winston.transports.File, { name: 'error-file', filename: `filelog-error.log`, 'timestamp':false });
    worker.runTask('firstTask');
    let fn = function () { worker.removeLoggerTransport('error-file'); };
    expect(fn).to.not.throw(Error);
    done();
  });
});

