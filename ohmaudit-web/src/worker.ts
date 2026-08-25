interface WebWorkerEnvironment {
  CF_VERSION_METADATA: {
    id: string;
    tag: string;
    timestamp: string;
  };
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

const worker = {
  async fetch(request: Request, environment: WebWorkerEnvironment): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/deployment.json') {
      const metadata = environment.CF_VERSION_METADATA;
      return Response.json(
        {
          id: metadata.id,
          tag: metadata.tag || null,
          createdAt: metadata.timestamp,
        },
        {
          headers: {
            'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
            expires: '0',
            pragma: 'no-cache',
            'x-content-type-options': 'nosniff',
          },
        },
      );
    }
    return environment.ASSETS.fetch(request);
  },
};

export default worker;
