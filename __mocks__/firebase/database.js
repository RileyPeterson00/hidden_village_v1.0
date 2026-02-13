/**
 * Mock for firebase/database
 * Mocks: getDatabase(), ref(), set(), get()
 */

const { createMockSnapshot } = require('./fixtures');

const getDatabase = jest.fn(() => ({
  app: { options: { projectId: 'test-project' } },
}));

const ref = jest.fn((db, path) => ({
  path,
  db,
  _key: { path },
}));

const child = jest.fn((reference, path) => ({
  path: `${reference.path}/${path}`,
  parent: reference,
}));

const set = jest.fn(() => Promise.resolve());
const get = jest.fn((reference) =>
  Promise.resolve(createMockSnapshot({ id: 'mock-123', data: 'test' }))
);

const push = jest.fn((reference, value) =>
  Promise.resolve({ key: `key-${Date.now()}`, ref: { path: `${reference.path}/new` } })
);

const update = jest.fn(() => Promise.resolve());
const remove = jest.fn(() => Promise.resolve());

const onValue = jest.fn((reference, callback) => {
  callback(createMockSnapshot({ test: 'data' }));
  return jest.fn(); // unsubscribe
});

// Query functions (used by database.js)
const query = jest.fn((...args) => ({
  _query: true,
  constraints: args.slice(1),
}));

const orderByChild = jest.fn((path) => ({ _type: 'orderByChild', path }));
const orderByKey = jest.fn(() => ({ _type: 'orderByKey' }));
const equalTo = jest.fn((value) => ({ _type: 'equalTo', value }));
const startAt = jest.fn((value) => ({ _type: 'startAt', value }));
const endAt = jest.fn((value) => ({ _type: 'endAt', value }));
const limitToFirst = jest.fn((limit) => ({ _type: 'limitToFirst', limit }));

// Test helper: set custom data for get() to return
const setGetMockData = (data) => {
  get.mockResolvedValue(createMockSnapshot(data));
};

module.exports = {
  getDatabase,
  ref,
  child,
  set,
  get,
  push,
  update,
  remove,
  onValue,
  query,
  orderByChild,
  orderByKey,
  equalTo,
  startAt,
  endAt,
  limitToFirst,
  setGetMockData,
};
