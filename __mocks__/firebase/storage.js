/**
 * Mock for firebase/storage (VideoRecorder.js, DataMenu.js)
 */

const getStorage = jest.fn(() => ({
  bucket: 'test-bucket.appspot.com',
}));

// Storage ref - (storage, path) => ref-like object
const ref = jest.fn((storage, path) => ({ _storage: storage, path }));

// VideoRecorder: returns UploadTask with .on() - invoke complete callback so getDownloadURL runs
const uploadBytesResumable = jest.fn(() => ({
  snapshot: { ref: {} },
  on: (event, progress, error, complete) => {
    if (complete) setTimeout(complete, 0);
    return () => {};
  },
}));

const getDownloadURL = jest.fn(() => Promise.resolve('https://mock-url.com/file'));

// DataMenu: listAll returns { items, prefixes }
const listAll = jest.fn(() => Promise.resolve({ items: [], prefixes: [] }));

module.exports = {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  listAll,
};
