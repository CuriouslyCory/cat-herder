/// <reference types="vite/client" />

type QueryParams = Record<string, string | number | boolean>;

export class NeonClient {
  constructor(
    private readonly apiUrl: string,
    private readonly getToken: () => Promise<string>,
  ) {}

  /**
   * Upsert a row using PostgREST merge-duplicates resolution.
   */
  async upsert(table: string, data: Record<string, unknown>): Promise<void> {
    const token = await this.getToken();
    const response = await fetch(`${this.apiUrl}/${table}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`NeonClient.upsert failed [${response.status}]: ${await response.text()}`);
    }
  }

  /**
   * Select rows from a table with optional PostgREST query parameters.
   */
  async select<T>(table: string, query?: QueryParams): Promise<T[]> {
    const token = await this.getToken();
    const url = new URL(`${this.apiUrl}/${table}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, String(value));
      }
    }
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`NeonClient.select failed [${response.status}]: ${await response.text()}`);
    }
    return (await response.json()) as T[];
  }

  /**
   * Delete rows from a table matching the provided PostgREST query parameters.
   */
  async delete(table: string, query?: QueryParams): Promise<void> {
    const token = await this.getToken();
    const url = new URL(`${this.apiUrl}/${table}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, String(value));
      }
    }
    const response = await fetch(url.toString(), {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`NeonClient.delete failed [${response.status}]: ${await response.text()}`);
    }
  }
}
