'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getObjectFromSchema = exports.deepDiff = undefined;

var _mongoose = require('mongoose');

var _mongoose2 = _interopRequireDefault(_mongoose);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _deepDiff = require('deep-diff');

var _deepDiff2 = _interopRequireDefault(_deepDiff);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var Schema = _mongoose2.default.Schema;

var deepDiff = exports.deepDiff = function deepDiff(origin, comparand) {
  var differences = _deepDiff2.default.diff(origin, comparand);
  var result = {};
  differences.forEach(function (element) {
    if (element.kind === 'E') {
      _lodash2.default.merge(result, _lodash2.default.pick(comparand, element.path));
    }
  });
  return result;
};

var getObjectFromSchema = exports.getObjectFromSchema = function getObjectFromSchema(schema) {
  var values = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

  var options = {
    server: {
      reconnectTries: 0
    }
  };

  var dummyMongoConnection = _mongoose2.default.createConnection();
  var DummyModel = dummyMongoConnection.model('dummyName', new Schema(schema));
  var getDefaultObject = new DummyModel(values).toJSON();
  delete getDefaultObject._id;
  delete getDefaultObject.__v;
  delete getDefaultObject.$setOnInsert;
  return getDefaultObject;
};
//# sourceMappingURL=utils.js.map