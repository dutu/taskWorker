taskWorker
=======
[![Build Status](https://travis-ci.org/dutu/taskWorker.svg?branch=master)](https://travis-ci.org/dutu/taskWorker/) ![Dependencies Status](https://david-dm.org/dutu/taskWorker.svg)



Provides a class that can easyly be extended for funning tasks repetitively 

Example below defins a worker with a simple task `firstTask`, which logs to the console every second. 

```js
class Worker extends TaskWorker {
  constructor(workerName) {
    super(workerName);
  }

  firstTask(next) {
	console.log('log this text every 1000ms');
    next(1000);
  }
}

let worker = new Worker('workersName');
worker.registerTask('firstTask');
worker.runTask('firstTask');
```


A set of configuration parameters can be defined for each task.
Example:


```js
class Worker extends TaskWorker {
  constructor(workerName) {
    super(workerName);
  }

  firstTask(next) {
	console.log('log this text every 1000ms');
    next(1000);
  }
}

let worker = new Worker('workersName');

worker.registerTask('firstTask');
let extendedSchema = {
  newConfigParameter: {
    type: String,
    default: 'a default value',
  },
};
worker.setExtendedTaskConfigSchema('firstTask', extendedSchema); 

worker.runTask('firstTask');
```






## Logger

`TaskWorker` uses [winston](https://www.npmjs.com/package/winston) for logging. 
The default logger has the Console transport defined as follwing:

```js
let defaultLogger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({
      colorize: 'all',
      json: 'true',
    })
  ],
});
defaultLogger.setLevels(winston.config.syslog.levels);
```

You can add or remove transports via the `addLoggerTransport()` and `removeLoggerTransport()` methods:
```js
  worker.addLoggerTransport(winston.transports.File, { filename: 'somefile.log' });
  worker.removeLoggerTransport(winston.transports.Console);
```

## Methods

### getStatus()

Example:

```js
worker.getStatus();
```

Example result:

```js
{
  "worker": {
    "restartedAt": "2016-11-08T10:12:42.739Z"
  },
  "tasks": [
    {
      "taskName": "firstTask",
      "startedAt": "2016-11-08T10:12:42.684Z",
      "shouldRun": false,
      "state": "stopped",
      "lastRunAt": "1970-01-01T00:00:00.000Z",
      "delayedMS": null
    }
  ],
  "dbConnection": {
    "state": null
  }
}
```

### setExtendedTaskConfigSchema()

Extends the default task configuration schema. Schema is a JSON that follws moongoose schema types
 
The default task configuration schema is:

```js
{
  taskName: {
    type: String
  },
  startedAt: {
    type: Date,
    default: new Date(),
  },
  shouldRun: {
    type: Boolean,
    default: false,
  },
}
```


**Example:**

```js
let extendedSchema = {
  newConfigParameter: {
    type: String,
    default: 'defaultValue',
  },
};

worker.setExtendedTaskConfigSchema(extendedSchema);
worker.getStatus();
```

Result:

```js
{
  "worker": {
    "restartedAt": "2016-11-08T10:23:21.297Z"
  },
  "tasks": [
    {
      "taskName": "firstTask",
      "startedAt": "2016-11-08T10:12:42.684Z",
      "shouldRun": false,
      "state": "stopped",
      "lastRunAt": "1970-01-01T00:00:00.000Z",
      "delayedMS": null,
      "newConfigParameter": "default value",
    }
  ],
  "dbConnection": {
    "state": null
  }
}
```

# License #

[MIT](LICENSE)