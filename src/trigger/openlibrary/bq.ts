import { BigQuery } from "@google-cloud/bigquery";
import { env } from "@/env.node";

export class BQClient {
  bq: BigQuery;
  projectId: string;
  location: string;

  constructor(options?: { projectId?: string; location?: string }) {
    const credentials = env.BIGQUERY_CREDENTIALS_JSON;
    this.projectId = options?.projectId || credentials.project_id;
    this.location = options?.location || "us-west1";
    this.bq = new BigQuery({
      location: this.location,
      ...(credentials
        ? {
            credentials,
            projectId: this.projectId,
          }
        : {}),
    });
  }

  queryStream(query: string) {
    return this.bq.createQueryStream({
      query,
      projectId: this.projectId,
      location: this.location,
    });
  }

  async createQueryJob(query: string) {
    // Must await job.promise() to wait for the job to complete
    const [job] = await this.bq.createQueryJob({
      location: this.location,
      projectId: this.projectId,
      query,
    });
    return job;
  }

  /** Runs a query to completion and returns its rows. For small result sets. */
  async query<TRow>(query: string): Promise<TRow[]> {
    const [rows] = await this.bq.query({
      location: this.location,
      query,
    });
    return rows as TRow[];
  }
}
