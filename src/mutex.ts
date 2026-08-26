export type ChannelMutex = {
  run: <T>(key: string, fn: () => Promise<T>) => Promise<T>;
};

export function createChannelMutex(): ChannelMutex {
  const locks = new Map<string, Promise<void>>();

  return {
    async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
      const previous = locks.get(key) ?? Promise.resolve();
      let release: () => void = () => {};
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      const tail = previous.then(() => current);
      locks.set(key, tail);
      await previous;

      try {
        return await fn();
      } finally {
        release();
        if (locks.get(key) === tail) {
          locks.delete(key);
        }
      }
    },
  };
}
