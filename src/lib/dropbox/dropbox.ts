/** Handles requests and responses from dropbox **/
import type { Result } from '#lib';
import { standardFetcher } from '#lib/fetcher.ts';
import { DROPBOX_API_KEY } from '$app/env/private';

export function dropboxService(token: string = DROPBOX_API_KEY) {
  let fetcher = standardFetcher({ token })

  async function doesVideoExists(name: number): Promise<Result<any>> {
    let response = await fetcher.request<any>("GET", `/api/v4/leads/${name}`)
    return response
  }

  return { getVideo }
}
