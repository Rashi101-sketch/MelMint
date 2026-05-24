const { ZodError } = require("zod");

/**
 * Express middleware factory for Zod validation.
 * Validates req.body, req.query, or req.params against a Zod schema.
 *
 * @param {import("zod").ZodSchema} schema - Zod schema to validate against
 * @param {"body" | "query" | "params"} source - Request property to validate
 * @returns {import("express").RequestHandler}
 */
function validate(schema, source = "body") {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req[source]);
      req[source] = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        }));

        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: formattedErrors,
        });
      }
      next(error);
    }
  };
}

module.exports = validate;
