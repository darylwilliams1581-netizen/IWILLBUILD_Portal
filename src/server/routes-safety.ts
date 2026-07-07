import type { Express } from 'express';


export function register(app: Express): void {
  app.post("/api/safety/ai/draft", safety_ai_draft_post_315);
  app.get("/api/safety/documents", safety_documents_get_316);
  app.post("/api/safety/documents", safety_documents_post_317);
  app.delete("/api/safety/documents/:id", safety_documents_id_delete_318);
  app.get("/api/safety/documents/:id/download", safety_documents_id_download_get_319);
  app.get("/api/safety/generated-posters", safety_generated_posters_get_320);
  app.post("/api/safety/generated-posters", safety_generated_posters_post_321);
  app.delete("/api/safety/generated-posters/:id", safety_generated_posters_id_delete_322);
  app.get("/api/safety/job-safety-plans", safety_job_safety_plans_get_323);
  app.post("/api/safety/job-safety-plans", safety_job_safety_plans_post_324);
  app.delete("/api/safety/job-safety-plans/:id", safety_job_safety_plans_id_delete_325);
  app.put("/api/safety/job-safety-plans/:id", safety_job_safety_plans_id_put_326);
  app.get("/api/safety/job-swms", safety_job_swms_get_327);
  app.post("/api/safety/job-swms", safety_job_swms_post_328);
  app.delete("/api/safety/job-swms/:id", safety_job_swms_id_delete_329);
  app.get("/api/safety/job-swms/:id", safety_job_swms_id_get_330);
  app.put("/api/safety/job-swms/:id", safety_job_swms_id_put_331);
  app.post("/api/safety/job-swms/:id/share-token", safety_job_swms_id_share_token_post_332);
  app.get("/api/safety/job-swms/:id/signoffs", safety_job_swms_id_signoffs_get_333);
  app.post("/api/safety/job-swms/:id/signoffs", safety_job_swms_id_signoffs_post_334);
  app.delete("/api/safety/job-swms/:id/signoffs/:signoffId", safety_job_swms_id_signoffs_signoffId_delete_335);
  app.get("/api/safety/plans", safety_plans_get_336);
  app.post("/api/safety/plans", safety_plans_post_337);
  app.post("/api/safety/plans/seed", async (req, res, next) => { const { default: h } = await import("./api/safety/plans/seed/POST.js"); return h(req, res, next); });
  app.delete("/api/safety/plans/:id", safety_plans_id_delete_339);
  app.put("/api/safety/plans/:id", safety_plans_id_put_340);
  app.get("/api/safety/plans/:id/export", safety_plans_id_export_get_341);
  app.get("/api/safety/plans/:id/pack", safety_plans_id_pack_get_342);
  app.get("/api/safety/posters", safety_posters_get_343);
  app.post("/api/safety/posters", safety_posters_post_344);
  app.delete("/api/safety/posters/:id", safety_posters_id_delete_345);
  app.get("/api/safety/swms", safety_swms_get_346);
  app.post("/api/safety/swms", safety_swms_post_347);
  app.post("/api/safety/swms/seed", async (req, res, next) => { const { default: h } = await import("./api/safety/swms/seed/POST.js"); return h(req, res, next); });
  app.delete("/api/safety/swms/:id", safety_swms_id_delete_349);
  app.get("/api/safety/swms/:id", safety_swms_id_get_350);
  app.put("/api/safety/swms/:id", safety_swms_id_put_351);
  app.post("/api/safety/swms/:id/duplicate", safety_swms_id_duplicate_post_352);
  app.get("/api/safety/swms/:id/export", safety_swms_id_export_get_353);
}
