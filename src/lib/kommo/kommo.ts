/** Handles requests from Kommo **/
import type { HTTPMethods, Result } from '#lib';
import { KOMMO_SUBDOMAIN, KOMMO_ACCESS_TOKEN } from '$app/env/private';

const SUBDOMAIN = KOMMO_SUBDOMAIN;
const ACCESS_TOKEN = KOMMO_ACCESS_TOKEN;

export type Stage = {
  name: string,
  id: number
}

export type Pipeline = {
  id: number,
  stages: Stage[]
}

const PIPELINES: Record<"VENTAS" | "PRODUCCION", Pipeline> = {
  VENTAS: {
    id: 0,
    stages: [
      { name: "Lead Entrante", id: 0 },
      { name: "Contacto Inicial", id: 0 },
      { name: "Recontactar", id: 0 },
      { name: "Seguimiento", id: 0 },
      { name: "Interesado", id: 0 },
      { name: "En Conversación", id: 0 },
      { name: "Invoice Enviado", id: 0 },
      { name: "Lead Ganado", id: 0 },
      { name: "Lead Perdido", id: 0 },
    ]
  },
  PRODUCCION: {
    id: 0,
    stages: [
      { name: "Diseño", id: 0 },
      { name: "Aprobación de Diseño", id: 0 },
      { name: "Lista de Espera", id: 0 },
      { name: "Impresión 3D", id: 0 },
      { name: "Fundición", id: 0 },
      { name: "Trabajo en Metal", id: 0 },
      { name: "Engaste", id: 0 },
      { name: "Acabado", id: 0 },
      { name: "Control de Calidad", id: 0 },
      { name: "Listo para Entrega", id: 0 },
      { name: "Entregado", id: 0 },
      { name: "Post-Entrega", id: 0 },
      { name: "Lead Ganado", id: 0 },
      { name: "Lead Perdido", id: 0 },
    ]
  }
}

export type KommoServiceArgs = {
  subdomain: string,
  token: string
}

export type KommoLead = {
  id: number;
  name: string;
  price: number;
  responsible_user_id: number;
  status_id: number;
  pipeline_id: number;
  created_at: number;
  updated_at: number;
  closed_at: number | null;
  custom_fields_values: Array<{
    field_id: number;
    field_name: string;
    field_type: string;
    values: Array<{ value: unknown; enum_id?: number; enum_code?: string }>;
  }> | null;
  _embedded?: {
    contacts?: Array<{ id: number; is_main: boolean }>;
  };
}

export type KommoUser = {
  id: number;
  name: string;
  email: string;
};

export type KommoContact = {
  id: number;
  name: string;
  first_name: string;
  last_name: string;
  custom_fields_values: Array<{
    field_id: number;
    field_code: string | null;
    values: Array<{ value: unknown }>;
  }> | null;
};

export type KommoPipeline = {
  id: number;
  name: string;
  _embedded: {
    statuses: Array<{
      id: number;
      name: string;
      pipeline_id: number;
    }>;
  };
};

function kommoFetcher({ token, subdomain }: KommoServiceArgs) {
  function trimEndpoint(endpoint: string) {
    if (endpoint.startsWith("/")) { endpoint = endpoint.substring(1) }
    return endpoint
  }

  function constructOptions(
    method: HTTPMethods,
    body?: any,
    headers?: Record<string, string>
  ) {
    let options: any = {
      method,
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...headers
      }
    }
    if (method != "GET" && body) {
      try {
        options["body"] = JSON.stringify(body);
      } catch (e) {
        throw Error("Error while parsing JSON")
      }
    }
    return options
  }

  function getRetryTime(response: Response) {
    const retryAfterHeader = response.headers.get("Retry-After");
    return retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 2000;
  }

  async function doFetch<T>(url: string, options: RequestInit, retries = 3): Promise<Result<T>> {
    try {
      let response = await fetch(url, options);
      if (response.status === 204) {
        return { success: true, data: null as unknown as T };
      }

      if (response.status === 429) {
        if (retries <= 0) {
          return {
            success: false,
            error: `Kommo API Error [429 Too Many Requests]: Se superaron los reintentos máximos permitidos.`,
            status: 429,
          };
        }

        await new Promise((r) => setTimeout(r, getRetryTime(response)));
        return doFetch<T>(url, options, retries - 1);
      }

      const text = await response.text();
      let data: any = text ? JSON.parse(text) : null;

      if (!response.ok) {
        const errorDetail = (typeof data === "object" && data !== null) ? JSON.stringify(data) : text;
        return {
          success: false,
          error: `Kommo API Error [${response.status} ${response.statusText}]: ${errorDetail}`,
          status: response.status,
        };
      }

      return {
        success: true,
        data,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Kommo API Network Error: ${error.message}`,
        status: 500,
      };
    }
  }

  async function request<T>(method: HTTPMethods, endpoint: string, body?: any, headers?: Record<string, string>): Promise<Result<T>> {
    endpoint = trimEndpoint(endpoint)
    let options = constructOptions(method, body, headers)
    let result = await doFetch<T>(`https://${subdomain}.kommo.com/${endpoint}`, options)
    return result
  }

  return {
    request
  }
}

function getFieldValue(leadObject: KommoLead, customFieldId: number) {
  let field = leadObject.custom_fields_values?.find((obj) => obj.field_id === customFieldId);
  return field ? field.values[0].value : null;
}

export function KommoService(args?: KommoServiceArgs) {
  let subdomain: string = ""
  let token: string = ""

  if (args) {
    subdomain = args.subdomain
    token = args.token
  } else {
    subdomain = SUBDOMAIN
    token = ACCESS_TOKEN
  }

  let fetcher = kommoFetcher({ subdomain, token })

  async function getLead(leadId: number): Promise<Result<KommoLead>> {
    let response = await fetcher.request<KommoLead>("GET", `/api/v4/leads/${leadId}`)
    return response
  }

  function leadIsInProduction(lead: KommoLead): boolean {
    return lead.pipeline_id === PIPELINES.PRODUCCION.id
  }

  function getLeadProductionStage(lead: KommoLead) {
    return PIPELINES.PRODUCCION.stages.find((stage) => stage.id === lead.status_id)!
  }

  return { getLead, leadIsInProduction, getLeadProductionStage }
}
