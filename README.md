# Audiobook-Covers

Audiobook-Covers is a searchable archive of audiobook cover art collected from
[reddit.com/r/audiobookcovers](https://www.reddit.com/r/audiobookcovers/).

Covers are indexed two ways: by semantic similarity, using
[Jina CLIP v2](https://jina.ai/) embeddings stored in pgvector, and by book
metadata, using Postgres full-text search over an
[OpenLibrary](https://openlibrary.org/) catalogue that is refreshed by a
scheduled ETL. Individual covers are matched to their OpenLibrary work with a
multi-phase OCR and LLM pipeline, so you can search for a cover by what it looks
like or by the book it belongs to.

The purpose of this project is to create a centralized and searchable archive of
audiobook covers for enthusiasts, researchers, and developers.

This project is available at [audiobookcovers.com](https://audiobookcovers.com)

## Architecture

- **Web app and API**: [TanStack Start](https://tanstack.com/start) on Cloudflare
  Workers, with Hyperdrive pooling connections to Postgres
- **Database**: Postgres on [PlanetScale](https://planetscale.com/), with
  pgvector for embedding search
- **Background jobs**: [Trigger.dev](https://trigger.dev/) — the OpenLibrary ETL
  (S3 → BigQuery → Postgres) and the cover-to-work matching pipeline
- **Images**: served from `images.audiobookcovers.com` in several sizes and
  formats, with blurhash placeholders generated at index time

The OpenLibrary ETL is documented in detail in [`docs/openlibrary-etl.md`](docs/openlibrary-etl.md).

## API

A JSON search endpoint is available at `/api/search?q=...`. There is also a
`/cover/bytext?q=...` endpoint kept for backwards compatibility with
[audiobookshelf](https://www.audiobookshelf.org/).

## Development

Commands run through [Task](https://taskfile.dev/):

```sh
task dev    # dev server + Trigger.dev local runner
task build  # typecheck and build
```

See [`AGENTS.md`](AGENTS.md) for a fuller description of the layout and
conventions.

## Contributing

- Report issues or request features using GitHub Issues.
- Submit bug fixes or improvements via pull requests.

## License

This project is licensed under the GNU General Public License v3.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Weldawadyathink/Audiobook-Covers&type=Date)](https://star-history.com/#Weldawadyathink/Audiobook-Covers&Date)
