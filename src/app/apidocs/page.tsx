export default function Page() {
  return (
    <div className="m-12 max-w-prose">
      <h1 className="my-2 text-xl">API Reference</h1>
      <p className="my-2">
        The API has been rewritten to use tRPC, which is not designed for use
        outside of this repo. There is a legacy endpoint in use by the
        Audiobookshelf project. If you would like to consume an API from this
        service, please submit an issue on GitHub.
      </p>
    </div>
  );
}
