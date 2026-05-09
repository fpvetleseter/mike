import { NextFunction, Request, Response } from "express";
import { z, ZodSchema } from "zod";

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(422).json({
        data: null,
        error: "Ugyldig forespørsel",
        details: z.flattenError(result.error),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
