/**
 * Custom request options extending the standard RequestInit
 */
export interface RequestOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * Custom error class for request failures
 */
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public url: string
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

/**
 * Default request configuration
 */
const DEFAULT_OPTIONS: Partial<RequestOptions> = {
  timeout: 30000, // 30 seconds
  retries: 3,
  retryDelay: 1000, // 1 second
};

/**
 * Creates an AbortController with timeout
 */
function createTimeoutController(timeout: number): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeout);
  return controller;
}

/**
 * Delays execution for a specified time
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determines if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof RequestError) {
    // Retry on 5xx server errors and 408, 429 status codes
    return error.status >= 500 || error.status === 408 || error.status === 429;
  }
  // Retry on network errors (fetch aborted, network failures)
  return error instanceof TypeError || error instanceof DOMException;
}

/**
 * Enhanced request function with retry logic, timeout, and better error handling
 */
export async function request<TResponse>(
  url: string,
  options: RequestOptions = {}
): Promise<TResponse> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const { timeout, retries = 3, retryDelay = 1000, ...fetchOptions } = config;
  
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = createTimeoutController(timeout!);
      
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new RequestError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          response.statusText,
          url
        );
      }

      // Handle different response types
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/json')) {
        return await response.json() as TResponse;
      } else if (contentType?.includes('text/')) {
        return await response.text() as TResponse;
      } else {
        return await response.arrayBuffer() as TResponse;
      }

    } catch (error) {
      lastError = error;
      
      // Don't retry on the last attempt
      if (attempt === retries) {
        break;
      }

      // Only retry on retryable errors
      if (!isRetryableError(error)) {
        throw error;
      }

      // Wait before retrying (exponential backoff)
      const delayTime = retryDelay * Math.pow(2, attempt);
      await delay(delayTime);
    }
  }

  // If we get here, all retries failed
  if (lastError instanceof RequestError) {
    throw lastError;
  }
  
  throw new RequestError(
    `Request failed after ${retries + 1} attempts`,
    0,
    'Unknown error',
    url
  );
}

/**
 * Convenience method for GET requests
 */
export async function get<TResponse>(
  url: string,
  options: Omit<RequestOptions, 'method'> = {}
): Promise<TResponse> {
  return request<TResponse>(url, { ...options, method: 'GET' });
}

/**
 * Convenience method for POST requests
 */
export async function post<TResponse>(
  url: string,
  data?: unknown,
  options: Omit<RequestOptions, 'method' | 'body'> = {}
): Promise<TResponse> {
  const body = data ? JSON.stringify(data) : undefined;
  return request<TResponse>(url, {
    ...options,
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

/**
 * Convenience method for PUT requests
 */
export async function put<TResponse>(
  url: string,
  data?: unknown,
  options: Omit<RequestOptions, 'method' | 'body'> = {}
): Promise<TResponse> {
  const body = data ? JSON.stringify(data) : undefined;
  return request<TResponse>(url, {
    ...options,
    method: 'PUT',
    body,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

/**
 * Convenience method for DELETE requests
 */
export async function del<TResponse>(
  url: string,
  options: Omit<RequestOptions, 'method'> = {}
): Promise<TResponse> {
  return request<TResponse>(url, { ...options, method: 'DELETE' });
}