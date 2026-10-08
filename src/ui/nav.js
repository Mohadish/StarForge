// Lets any screen switch tabs without importing the app (avoids circular imports).
let goFn = () => {};
export const setGo = f => { goFn = f; };
export const go = id => goFn(id);
