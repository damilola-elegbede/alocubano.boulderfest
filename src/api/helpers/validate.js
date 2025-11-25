/**
 * Request Validation Helper
 *
 * Provides utilities for validating API request bodies against Zod schemas.
 *
 * @module src/api/helpers/validate
 */

/**
 * Validates request data against a Zod schema
 *
 * @template T
 * @param {import('zod').ZodSchema<T>} schema - The Zod schema to validate against
 * @param {unknown} data - The data to validate
 * @returns {{ success: true, data: T } | { success: false, errors: Array<{ path: string, message: string }> }}
 *
 * @example
 * import { CheckoutRequestSchema } from '../schemas/checkout.js';
 * import { validateRequest } from '../helpers/validate.js';
 *
 * const result = validateRequest(CheckoutRequestSchema, req.body);
 * if (!result.success) {
 *   return res.status(400).json({ errors: result.errors });
 * }
 * // result.data is now typed and validated
 */
export function validateRequest(schema, data) {
  const result = schema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

/**
 * Validates request data and returns a formatted error response if invalid
 *
 * @template T
 * @param {import('zod').ZodSchema<T>} schema - The Zod schema to validate against
 * @param {unknown} data - The data to validate
 * @param {object} res - Express response object
 * @returns {{ valid: true, data: T } | { valid: false }}
 *
 * @example
 * const result = validateRequestWithResponse(CheckoutRequestSchema, req.body, res);
 * if (!result.valid) return; // Response already sent
 * // result.data is validated
 */
export function validateRequestWithResponse(schema, data, res) {
  const result = validateRequest(schema, data);

  if (!result.success) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      errors: result.errors,
    });
    return { valid: false };
  }

  return {
    valid: true,
    data: result.data,
  };
}

/**
 * Creates a validation middleware for Express routes
 *
 * @template T
 * @param {import('zod').ZodSchema<T>} schema - The Zod schema to validate against
 * @returns {(req: any, res: any, next: () => void) => void}
 *
 * @example
 * import { createValidationMiddleware } from '../helpers/validate.js';
 * import { CheckoutRequestSchema } from '../schemas/checkout.js';
 *
 * app.post('/api/checkout',
 *   createValidationMiddleware(CheckoutRequestSchema),
 *   (req, res) => {
 *     // req.body is validated
 *   }
 * );
 */
export function createValidationMiddleware(schema) {
  return (req, res, next) => {
    const result = validateRequest(schema, req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: result.errors,
      });
    }

    // Replace body with validated data (strips unknown fields)
    req.body = result.data;
    next();
  };
}

/**
 * Formats Zod errors into a user-friendly object keyed by field path
 *
 * @param {import('zod').ZodError} zodError - The Zod error object
 * @returns {Record<string, string>} Object mapping field paths to error messages
 *
 * @example
 * const result = schema.safeParse(data);
 * if (!result.success) {
 *   const fieldErrors = formatZodErrors(result.error);
 *   // { 'email': 'Invalid email format', 'cartItems.0.price': 'Price must be positive' }
 * }
 */
export function formatZodErrors(zodError) {
  const fieldErrors = {};

  for (const issue of zodError.issues) {
    const path = issue.path.join('.') || '_root';
    // Only keep the first error for each field
    if (!fieldErrors[path]) {
      fieldErrors[path] = issue.message;
    }
  }

  return fieldErrors;
}

/**
 * Validates partial data (for PATCH requests or partial updates)
 *
 * @template T
 * @param {import('zod').ZodSchema<T>} schema - The Zod schema (will be made partial)
 * @param {unknown} data - The data to validate
 * @returns {{ success: true, data: Partial<T> } | { success: false, errors: Array<{ path: string, message: string }> }}
 */
export function validatePartialRequest(schema, data) {
  // Note: This assumes the schema is a ZodObject. For other schema types,
  // you may need to handle differently.
  const partialSchema = schema.partial();
  return validateRequest(partialSchema, data);
}
