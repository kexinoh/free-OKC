let storageAvailable = true;

try {
  const storageTestKey = '__okc_test__';
  window.localStorage.setItem(storageTestKey, storageTestKey);
  window.localStorage.removeItem(storageTestKey);
} catch (error) {
  storageAvailable = false;
}

export const storage = {
  getItem(key) {
    if (!storageAvailable) return null;
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  },
  setItem(key, value) {
    if (!storageAvailable) return;
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // ignore storage errors
    }
  },
  removeItem(key) {
    if (!storageAvailable) return;
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      // ignore storage errors
    }
  },
};
