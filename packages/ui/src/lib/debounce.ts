export const debounce = (func: (...args: any) => void, delay: number) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;
  return (...args: any) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
};
