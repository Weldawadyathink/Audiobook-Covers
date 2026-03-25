export function createIsomorphicFn() {
  let serverFn;

  const withServer = {
    client(_clientFn) {
      return () => serverFn();
    },
  };

  const withClient = {
    server(fn) {
      serverFn = fn;
      return withServer;
    },
  };

  return Object.assign(() => serverFn?.(), {
    server(fn) {
      serverFn = fn;
      return withServer;
    },
    client(_clientFn) {
      return withClient;
    },
  });
}

export function createServerFn() {
  const builder = {
    middleware(_middleware) {
      return builder;
    },
    inputValidator(_validator) {
      return builder;
    },
    handler(fn) {
      return async (opts) => {
        return fn({ data: opts?.data });
      };
    },
  };
  return builder;
}
