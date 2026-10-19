import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
  KOMMO_SUBDOMAIN: {},
  KOMMO_ACCESS_TOKEN: {},
  DROPBOX_API_KEY: {}
});
