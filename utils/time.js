// utils/time.js

// Convert IST string to UTC Date
export function toUTCfromIST(istString) {
  const istDate = new Date(istString);
  // Subtract 5h30m = 19800000 ms
  return new Date(istDate.getTime() - (5.5 * 60 * 60 * 1000));
}

// Convert UTC Date back to IST string (for logs)
export function toISTfromUTC(utcDate) {
  return new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
}
