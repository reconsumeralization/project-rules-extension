/**
 * Base error class for custom errors in the extension.
 */
export class ExtensionError extends Error {
    public code: string;
    public status?: number;
    public details?: any;

    constructor(message: string, code: string, status?: number, details?: any) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.status = status;
        this.details = details;
        // Maintains proper stack trace in V8
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

/**
 * Represents an error related to network communication with the server.
 */
export class NetworkError extends ExtensionError {
    constructor(message: string = 'Network error while communicating with the server.', details?: any) {
        super(message, 'NETWORK_ERROR', undefined, details);
    }
}

/**
 * Represents an error reported by the server (e.g., validation error, internal server error).
 */
export class ServerError extends ExtensionError {
    constructor(message: string, code: string = 'SERVER_ERROR', status?: number, details?: any) {
        super(message, code, status, details);
    }
}

/**
 * Represents an authentication/authorization error.
 */
export class AuthError extends ExtensionError {
    constructor(message: string = 'Authentication failed. Please check your credentials or server configuration.') {
        super(message, 'AUTH_ERROR', 401); // Default to 401 Unauthorized
    }
} 