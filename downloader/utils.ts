export async function listFilesRecursively(dirPath: string): Promise<string[]> {
  const filePaths: string[] = [];

  try {
    // Attempt to get the absolute path to handle relative inputs gracefully
    const absoluteDirPath = Deno.realPathSync(dirPath);
    const dirEntry = await Deno.stat(absoluteDirPath);

    // Ensure the provided path is actually a directory
    if (!dirEntry.isDirectory) {
      throw new Error(`Path '${dirPath}' is not a directory.`);
    }

    // Iterate over the entries in the directory
    for await (const entry of Deno.readDir(absoluteDirPath)) {
      const entryPath = `${absoluteDirPath}/${entry.name}`;

      if (entry.isFile) {
        // If it's a file, add its path to our list
        filePaths.push(entryPath);
      } else if (entry.isDirectory) {
        // If it's a directory, recursively call the function for it
        // and concatenate the results
        const subDirFiles = await listFilesRecursively(entryPath);
        filePaths.push(...subDirFiles);
      }
      // Symlinks are ignored for simplicity; you could add logic for them if needed.
    }
  } catch (error) {
    // Provide more specific error messages for common issues
    if (error instanceof Deno.errors.NotFound) {
      console.warn(`Directory not found: '${dirPath}'. Returning empty array.`);
      return []; // Return empty array if directory doesn't exist
    } else if (error instanceof Deno.errors.PermissionDenied) {
      throw new Error(
        `Permission denied to access '${dirPath}': ${error.message}`,
      );
    } else {
      throw error; // Re-throw other unexpected errors
    }
  }

  return filePaths;
}
