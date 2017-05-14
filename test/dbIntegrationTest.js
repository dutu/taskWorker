'use strict';

import mongoose from 'mongoose';
import winston from 'winston';
import _ from 'lodash';
import { timesSeries, series } from 'async'
import chai from 'chai';

const Schema = mongoose.Schema;
const expect = chai.expect;
chai.use(require('chai-json-schema'));

import TaskWorker from '../src/index.js';

class Worker extends TaskWorker {
  constructor(workerName) {
    super(workerName);
  }

  firstTask(next) {
    next(10);
  }

  secondTask(next) {
  }
}

describe("Integration Test", function () {
  let log = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({
        colorize: 'all',
      })
    ],
  });
  log.setLevels(winston.config.syslog.levels);

  mongoose.Promise = global.Promise;

  const mongodbURI = `mongodb://integrationtester:30jZ32u876d62w59@ds023714.mlab.com:23714/xworkers_tests`;
  let dbTestConn = mongoose.createConnection(mongodbURI, function (err) {
    if (err) {
      log.crit(`IntegrationTest.connect_db: ${err.message}`);
    } else {
      log.info(`IntegrationTest.connect_db: mongodb connection successful`);
    }
  });
  dbTestConn.on('error', function (err) {   // any connection errors will be written to the console
    log.crit(`dbTestConn: init_db: ${err.message}`);
  });

  let workerName = 'integrationTestWorker';
  let TestConfigModel = dbTestConn.model(`${workerName}.config`, new Schema({}, { collection: `${workerName}.config` , strict: false }));

  describe('connectMongodb()', function () {
    it(`should create a connection`, function (done) {
      let worker = new TaskWorker('integrationTestWorker');
      let conn = worker.connectMongodb(mongodbURI, function (err) {
        expect(err).to.not.exist;
        expect(conn).to.be.an('object');
        expect(conn).to.have.deep.property("db");
        done();
      });
    });
    it(`should return authentication error`, function (done) {
      let worker = new TaskWorker('integrationTestWorker');
      let conn = worker.connectMongodb(mongodbURI + "e", function (err) {
        expect(err).to.be.instanceOf(Error);
        expect(conn).to.be.an('object');
        done();
      });
    });
    it('should throw error when called without "callback" parameter', function (done) {
      let worker = new TaskWorker('integrationTestWorker');
      let fn = function () { worker.connectMongodb(mongodbURI); };
      expect(fn).to.throw('integrationTestWorker.connectMongodb: Callback is not a function');
      done();
    });
  });

  describe('getStatus()', function () {
    it(`should return task status with default parameters`, function (done) {
      let worker = new TaskWorker('integrationTestWorker');
      let status = worker.getStatus();
      expect(status).to.have.deep.property('worker.restartedAt').that.is.a('date');
      expect(status).to.have.property('tasks').that.have.length(0);

      worker = new TaskWorker('integrationTestWorker');
      let conn = worker.connectMongodb(mongodbURI, function (err) {
        status = worker.getStatus();
        expect(status).to.have.deep.property('worker.restartedAt').that.is.a('date');
        expect(status).to.have.property('tasks').that.have.length(1);
        expect(status.tasks[0].taskName).to.equal('refreshTaskConfigsFromDb');
        expect(status.tasks[0].startedAt).to.be.a('date');
        expect(status.tasks[0].state).to.equal('stopped');
        expect(status.tasks[0].lastRunAt).to.be.a('date');
        expect(status.tasks[0].delayedMS).to.equal(null);
        expect(status.dbConnection.state).to.equal('connected');
        expect(status.dbConnection.mongodbURI).to.equal(`mongodb://integrationtester:****@ds023714.mlab.com:23714/xworkers_tests`);
        done();
      });
    });
  });

  describe('changeTaskConfigParameters()', function () {
    it(`should create new db config, if it doesn't exists`, function (done) {
      let worker = new TaskWorker('integrationTestWorker');

      worker.connectMongodb(mongodbURI, function(err){
        expect(err).to.not.exist;
        TestConfigModel.remove({}, function (err) {
          expect(err).to.not.exist;
          worker.changeTaskConfigParameters('refreshTaskConfigsFromDb', { startedAt: '2015-12-24' }, function (err) {
            expect(err).to.not.exist;
            TestConfigModel.findOne().lean().exec(function (err, foundConfig) {
              expect(foundConfig).to.be.an('object');
              expect(foundConfig.startedAt.valueOf()).to.be.equal(new Date('2015-12-24').valueOf());
              done();
            });
          });
        });
      });
    });

    it(`should update new db config, if it already exists`, function (done) {
      let worker = new TaskWorker('integrationTestWorker');

      worker.connectMongodb(mongodbURI, function(err){
        expect(err).to.not.exist;
        TestConfigModel.remove({}, function (err) {
          expect(err).to.not.exist;
          worker.changeTaskConfigParameters('refreshTaskConfigsFromDb', { startedAt: '2015-12-24' }, function (err) {
            expect(err).to.not.exist;
            TestConfigModel.findOne().lean().exec(function (err, foundConfig) {
              expect(foundConfig).to.be.an('object');
              expect(foundConfig.startedAt.valueOf()).to.be.equal(new Date('2015-12-24').valueOf());
              done();
            });
          });
        });
      });
    });

    it(`should change basic parameter`, function (done) {
      let worker = new Worker('integrationTestWorker');

      worker.connectMongodb(mongodbURI, function(err){
        expect(err).to.not.exist;
        TestConfigModel.remove({}, function (err) {
          expect(err).to.not.exist;
          worker.changeTaskConfigParameters('refreshTaskConfigsFromDb', { startedAt: '2015-12-24' }, function (err) {
            expect(err).to.not.exist;
            TestConfigModel.findOne().lean().exec(function (err, foundConfig) {
              expect(foundConfig).to.be.an('object');
              expect(foundConfig.startedAt.valueOf()).to.be.equal(new Date('2015-12-24').valueOf());
              worker.changeTaskConfigParameters('refreshTaskConfigsFromDb', { startedAt: '2013-12-24' }, function (err) {
                expect(err).to.not.exist;
                TestConfigModel.findOne().lean().exec(function (err, foundConfig) {
                  expect(foundConfig).to.be.an('object');
                  expect(foundConfig.startedAt.valueOf()).to.be.equal(new Date('2013-12-24').valueOf());
                  done();
                });
              });
            });
          });
        });
      });
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
      worker.connectMongodb(mongodbURI, function(err){
        expect(err).to.not.exist;
        TestConfigModel.remove({}, function (err) {
          expect(err).to.not.exist;
          worker.changeTaskConfigParameters('firstTask', { newConfigParameter: '2015-12-24' }, function (err) {
            expect(err).to.not.exist;
            TestConfigModel.findOne().lean().exec(function (err, foundConfig) {
              expect(foundConfig).to.be.an('object');
              expect(foundConfig.newConfigParameter).to.be.equal('2015-12-24');
              worker.changeTaskConfigParameters('firstTask', { newConfigParameter: '2013-12-24' }, function (err) {
                expect(err).to.not.exist;
                TestConfigModel.findOne().lean().exec(function (err, foundConfig) {
                  expect(foundConfig).to.be.an('object');
                  expect(foundConfig.newConfigParameter).to.be.equal('2013-12-24');
                  done();
                });
              });
            });
          });
        });
      });
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
      worker.connectMongodb(mongodbURI, function(err){
        expect(err).to.not.exist;
        TestConfigModel.remove({}, function (err) {
          expect(err).to.not.exist;
          worker.changeTaskConfigParameters('firstTask', { newConfigParameter: '2015-12-24' }, function (err) {
            expect(err).to.not.exist;
            TestConfigModel.findOne().lean().exec(function (err, foundConfig) {
              expect(foundConfig).to.be.an('object');
              expect(foundConfig.newConfigParameter).to.be.equal('2015-12-24');
              worker.changeTaskConfigParameters('firstTask', { newConfigParameter2: '2013-12-24' }, function (err) {
                expect(err).to.not.exist;
                TestConfigModel.findOne().lean().exec(function (err, foundConfig) {
                  expect(foundConfig).to.be.an('object');
                  expect(foundConfig.newConfigParameter).to.be.equal('2015-12-24');
                  expect(foundConfig.newConfigParameter2).to.be.equal('2013-12-24');
                  done();
                });
              });
            });
          });
        });
      });
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
      worker.connectMongodb(mongodbURI, function(err){
        expect(err).to.not.exist;
        TestConfigModel.remove({}, function (err) {
          expect(err).to.not.exist;
          worker.changeTaskConfigParameters('firstTask', { newConfigParameter: '2015-12-24' }, function (err) {
            expect(err).to.not.exist;
            TestConfigModel.findOne().lean().exec(function (err, foundConfig) {
              expect(foundConfig).to.be.an('object');
              expect(foundConfig.newConfigParameter).to.be.equal('2015-12-24');
              worker.changeTaskConfigParameters('firstTask', { newConfigParameter: '2013-12-24', other: '2013-12-24' }, function (err) {
                expect(err).to.not.exist;
                TestConfigModel.findOne().lean().exec(function (err, foundConfig) {
                  expect(foundConfig).to.be.an('object');
                  expect(foundConfig).to.not.have.property('other');
                  done();
                });
              });
            });
          });
        });
      });
    });
  });

  describe('runTask()', function () {
    it(`should change "shouldRun" parameter to "true"`, function (done) {
      let worker = new Worker('integrationTestWorker');
      worker.registerTask('firstTask');
      worker.connectMongodb(mongodbURI, function(err){
        expect(err).to.not.exist;
        TestConfigModel.findOne().lean().exec(function (err, foundConfig) {
          worker.runTask('firstTask');
          setTimeout(function () {
            TestConfigModel.findOne().lean().exec(function (err, foundConfig) {
              expect(err).to.not.exist;
              expect(foundConfig.shouldRun).to.be.true;
              done();
            });
          }, 100);
        });
      });
    });
  });

  describe('stopTask()', function () {
    it(`should change "shouldRun" parameter to "false"`, function (done) {
      let worker = new Worker('integrationTestWorker');
      worker.registerTask('firstTask');
      worker.connectMongodb(mongodbURI, function(err){
        expect(err).to.not.exist;
        TestConfigModel.findOne().lean().exec(function (err, foundConfig) {
          worker.runTask('firstTask');
          setTimeout(function () {
            TestConfigModel.findOne().lean().exec(function (err, foundConfig) {
              expect(err).to.not.exist;
              expect(foundConfig.shouldRun).to.be.true;
              worker.stopTask('firstTask');
              setTimeout(function () {
                TestConfigModel.findOne().lean().exec(function (err, foundConfig) {
                  expect(err).to.not.exist;
                  expect(foundConfig.shouldRun).to.be.false;
                  done();
                });
              }, 100);
            });
          }, 100);
        });
      });
    });
  });

  describe('runTask() and stopTask() consecutively', function () {
    it(`should change "shouldRun" parameter and change state`, function (done) {
      let worker = new Worker('integrationTestWorker');
      worker.registerTask('firstTask');
      worker.connectMongodb(mongodbURI, function(err){
        expect(err).to.not.exist;
        timesSeries(5,
          function (n, next) {
            series([
              function (callback) {
              setTimeout(callback, 100);
              },
              function (callback) {
                TestConfigModel.findOne({ taskName: 'firstTask' }).lean().exec(function (err, foundConfig) {
                  expect(foundConfig.shouldRun).to.be.false;
                  let status = worker.getStatus();
                  expect(status.tasks[0].state).to.equal('stopped');
                  expect(status.tasks[0].shouldRun).to.be.false;
                  callback(err)
                });
              },
              function (callback) {
                worker.runTask('firstTask');
                callback(null);
              },
              function (callback) {
                setTimeout(callback, 100);
              },
              function (callback) {
                TestConfigModel.findOne({ taskName: 'firstTask' }).lean().exec(function (err, foundConfig) {
                  expect(foundConfig.shouldRun).to.be.true;
                  let status = worker.getStatus();
                  expect(status.tasks[0].state).to.equal('delayed');
                  expect(status.tasks[0].shouldRun).to.be.true;
                  callback(err)
                });
              },
              function (callback) {
                worker.stopTask('firstTask');
                callback(null);
              },
            ], function (err, results) {
              expect(err).to.be.null;
              next(err)
            });
          },
          function (err) {
            expect(err).to.be.null;
            done();
          });
      });
    });
  });

  describe('refreshTaskConfigsFromDb()', function () {
    it(`should refresh parameter from database`, function (done) {
      let worker = new Worker('integrationTestWorker');
      worker.registerTask('firstTask');
      worker.connectMongodb(mongodbURI, function(err){
        expect(err).to.not.exist;
        worker.stopTask('firstTask');
        worker.runTask('refreshTaskConfigsFromDb');
        timesSeries(4,
          function (n, next) {
            series([
              function (callback) {
                setTimeout(callback, 1200);
              },
              function (callback) {
                TestConfigModel.findOne({ taskName: 'firstTask' }).lean().exec(function (err, foundConfig) {
                  let status = worker.getStatus();
                  expect(status.tasks[0].state).to.equal('stopped');
                  expect(status.tasks[0].shouldRun).to.be.false;
                  callback(err)
                });
              },
              function (callback) {
                TestConfigModel.findOneAndUpdate({ taskName: 'firstTask' }, { $set:{ shouldRun: true } }, { new: true }).lean().exec(function (err, foundConfig) {
                  expect(foundConfig.shouldRun).to.be.true;
                  callback(err)
                });
              },
              function (callback) {
                setTimeout(callback, 1200);
              },
              function (callback) {
                TestConfigModel.findOne({ taskName: 'firstTask' }).lean().exec(function (err, foundConfig) {
                  let status = worker.getStatus();
                  expect(status.tasks[0].state).to.equal('delayed');
                  expect(status.tasks[0].shouldRun).to.be.true;
                  callback(err)
                });
              },
              function (callback) {
                TestConfigModel.findOneAndUpdate({ taskName: 'firstTask' }, { $set:{ shouldRun: false } }, {new: true}).lean().exec(function (err, foundConfig) {
                  expect(foundConfig.shouldRun).to.be.false;
                  callback(err)
                });
              },
              function (callback) {
                setTimeout(callback, 1200);
              },
            ], function (err, results) {
              expect(err).to.be.null;
              next(err)
            });
          },
          function (err) {
            expect(err).to.be.null;
            done();
          });
      });
    });
  });

});
