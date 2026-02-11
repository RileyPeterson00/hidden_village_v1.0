/**
 * Mock for firebase/storage
 */

const getStorage = jest.fn(() => ({
  bucket: 'test-bucket.appspot.com',
}));

module.exports = {
  getStorage,
};
