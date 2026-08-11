import type { Request, Response } from "express";

export default async function handler(_req: Request, res: Response) {
  try {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      message: "Hello World!",
    });
  } catch (err) {
    console.error('[health] Unhandled error:', err);
    res.status(500).json({ status: "error" });
  }
}
