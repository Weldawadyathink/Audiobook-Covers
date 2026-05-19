import handler from "@tanstack/react-start/server-entry";

export type CloudflareRequestContext = {
  cloudflare: {
    env: Cloudflare.Env;
    ctx: ExecutionContext;
  };
};

declare module "@tanstack/react-start" {
  interface Register {
    server: {
      requestContext: CloudflareRequestContext;
    };
  }
}

export default {
  fetch(request, env: Cloudflare.Env, ctx: ExecutionContext) {
    return handler.fetch(request, {
      context: {
        cloudflare: {
          env,
          ctx,
        },
      },
    });
  },
} satisfies ExportedHandler<Cloudflare.Env>;
