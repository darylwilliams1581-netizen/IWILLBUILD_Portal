import type { Express } from 'express';

import fleet_get_119 from "./api/fleet/GET";
import fleet_post_120 from "./api/fleet/POST";
import fleet_driver_sessions_post_121 from "./api/fleet/driver-sessions/POST";
import fleet_driver_sessions_active_get_122 from "./api/fleet/driver-sessions/active/GET";
import fleet_driver_sessions_id_stop_post_123 from "./api/fleet/driver-sessions/[id]/stop/POST";
import fleet_flags_get_124 from "./api/fleet/flags/GET";
import fleet_service_logs_logId_delete_125 from "./api/fleet/service-logs/[logId]/DELETE";
import fleet_service_logs_logId_patch_126 from "./api/fleet/service-logs/[logId]/PATCH";
import fleet_vehicles_get_127 from "./api/fleet/vehicles/GET";
import fleet_id_delete_128 from "./api/fleet/[id]/DELETE";
import fleet_id_get_129 from "./api/fleet/[id]/GET";
import fleet_id_put_130 from "./api/fleet/[id]/PUT";
import fleet_id_driver_sessions_get_131 from "./api/fleet/[id]/driver-sessions/GET";
import fleet_id_files_get_132 from "./api/fleet/[id]/files/GET";
import fleet_id_prestarts_get_133 from "./api/fleet/[id]/prestarts/GET";
import fleet_id_prestarts_post_134 from "./api/fleet/[id]/prestarts/POST";
import fleet_id_service_logs_get_135 from "./api/fleet/[id]/service-logs/GET";
import fleet_id_service_logs_post_136 from "./api/fleet/[id]/service-logs/POST";

export function register(app: Express): void {
  app.get("/api/fleet", fleet_get_119);
  app.post("/api/fleet", fleet_post_120);
  app.post("/api/fleet/driver-sessions", fleet_driver_sessions_post_121);
  app.get("/api/fleet/driver-sessions/active", fleet_driver_sessions_active_get_122);
  app.post("/api/fleet/driver-sessions/:id/stop", fleet_driver_sessions_id_stop_post_123);
  app.get("/api/fleet/flags", fleet_flags_get_124);
  app.delete("/api/fleet/service-logs/:logId", fleet_service_logs_logId_delete_125);
  app.patch("/api/fleet/service-logs/:logId", fleet_service_logs_logId_patch_126);
  app.get("/api/fleet/vehicles", fleet_vehicles_get_127);
  app.delete("/api/fleet/:id", fleet_id_delete_128);
  app.get("/api/fleet/:id", fleet_id_get_129);
  app.put("/api/fleet/:id", fleet_id_put_130);
  app.get("/api/fleet/:id/driver-sessions", fleet_id_driver_sessions_get_131);
  app.get("/api/fleet/:id/files", fleet_id_files_get_132);
  app.get("/api/fleet/:id/prestarts", fleet_id_prestarts_get_133);
  app.post("/api/fleet/:id/prestarts", fleet_id_prestarts_post_134);
  app.get("/api/fleet/:id/service-logs", fleet_id_service_logs_get_135);
  app.post("/api/fleet/:id/service-logs", fleet_id_service_logs_post_136);
}
