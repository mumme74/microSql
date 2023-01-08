

const isObject = (obj) => {
  return typeof obj === 'object' &&
         obj !== null &&
         !Array.isArray(obj);
}

const isFunction = (obj) => {
  return obj instanceof Function;
}

const isString = (obj) => {
  return typeof obj === 'string';
}

module.exports = {
  isObject, isFunction, isString
}