function getRequiredDatabaseUrl() {
  const url = process.env.DATABASE_WRITE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Set DATABASE_WRITE_URL or DATABASE_URL before running Drizzle Kit.",
    );
  }
  return url;
}

export function databaseUrlWithSearchPath(schemaName: string) {
  const url = new URL(getRequiredDatabaseUrl());
  const existingOptions = url.searchParams.get("options");
  const searchPathOption = `-csearch_path=${schemaName},public`;

  url.searchParams.set(
    "options",
    existingOptions
      ? `${existingOptions} ${searchPathOption}`
      : searchPathOption,
  );

  return url.toString();
}
