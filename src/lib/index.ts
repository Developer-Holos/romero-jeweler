// place files you want to import through the `#lib` alias in this folder.

export type HTTPMethods = "POST" | "GET" | "PATCH" | "PUT" | "DELETE"

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string; status: number };
