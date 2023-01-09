
export const isObject = (obj) => {
  return typeof obj === 'object' &&
         obj !== null &&
         !Array.isArray(obj);
}

export const isFunction = (obj) => {
  return obj instanceof Function;
}

export const isString = (obj) => {
  return typeof obj === 'string';
}

export const isDigit = (c) => {
  c = c.charCodeAt(0);
  return c >= 48 && c <= 57
}

export const isLetter = (c) => {
  c = c.charCodeAt(0)
  return (c >= 65 && c <= 90) ||
    (c >= 97 && c <= 122);
}
