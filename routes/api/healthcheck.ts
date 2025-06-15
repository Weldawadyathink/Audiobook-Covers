import { define } from "../../utils.ts";
import { getDbPool } from "../../server/db.ts";

export const handler = define.handlers({
  GET() {
    const _ = getDbPool(); // Ensure database connection exists, but don't await
    return new Response(
      `Server is healthy!`,
    );
  },
});
