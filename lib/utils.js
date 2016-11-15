'use strict';

import mongoose from 'mongoose';
import _ from 'lodash';
import deep from "deep-diff";

const Schema = mongoose.Schema;

export const deepDiff = function deepDiff(origin, comparand) {
  let differences = deep.diff(origin, comparand);
  let result  = {};
  differences.forEach(element => {
    if (element.kind === 'E') {
      _.merge(result, _.pick(comparand, element.path));
    }
  });
  return result;
};

export const getObjectFromSchema = function getObjectFromSchema (schema, values = {}) {
  let options = {
    server: {
      reconnectTries: 0,
    }
  };

  let dummyMongoConnection = mongoose.createConnection();
  let DummyModel = dummyMongoConnection.model('dummyName', new Schema(schema));
  let getDefaultObject = new DummyModel(values).toJSON();
  delete getDefaultObject._id;
  delete getDefaultObject.__v;
  delete getDefaultObject.$setOnInsert;
  return getDefaultObject;
};
