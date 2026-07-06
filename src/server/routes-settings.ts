import type { Express } from 'express';

import settings_backup_get_362 from "./api/settings/backup/GET";
import settings_backup_post_363 from "./api/settings/backup/POST";
import settings_backup_export_get_364 from "./api/settings/backup/export/GET";
import settings_backup_run_post_365 from "./api/settings/backup/run/POST";
import settings_backup_destination_get_366 from "./api/settings/backup-destination/GET";
import settings_backup_destination_post_367 from "./api/settings/backup-destination/POST";
import settings_dazza_ai_key_get_368 from "./api/settings/dazza-ai-key/GET";
import settings_dazza_ai_key_post_369 from "./api/settings/dazza-ai-key/POST";
import settings_file_transfer_backup_get_370 from "./api/settings/file-transfer-backup/GET";
import settings_file_transfer_backup_post_371 from "./api/settings/file-transfer-backup/POST";
import settings_retention_get_372 from "./api/settings/retention/GET";
import settings_retention_post_373 from "./api/settings/retention/POST";
import settings_storage_provider_get_374 from "./api/settings/storage-provider/GET";
import settings_storage_provider_debug_get_375 from "./api/settings/storage-provider/debug/GET";
import settings_storage_provider_test_post_376 from "./api/settings/storage-provider/test/POST";
import settings_terminology_get_377 from "./api/settings/terminology/GET";
import settings_terminology_post_378 from "./api/settings/terminology/POST";
import settings_xero_credentials_get_379 from "./api/settings/xero-credentials/GET";
import settings_xero_credentials_post_380 from "./api/settings/xero-credentials/POST";

export function register(app: Express): void {
  app.get("/api/settings/backup", settings_backup_get_362);
  app.post("/api/settings/backup", settings_backup_post_363);
  app.get("/api/settings/backup/export", settings_backup_export_get_364);
  app.post("/api/settings/backup/run", settings_backup_run_post_365);
  app.get("/api/settings/backup-destination", settings_backup_destination_get_366);
  app.post("/api/settings/backup-destination", settings_backup_destination_post_367);
  app.get("/api/settings/dazza-ai-key", settings_dazza_ai_key_get_368);
  app.post("/api/settings/dazza-ai-key", settings_dazza_ai_key_post_369);
  app.get("/api/settings/file-transfer-backup", settings_file_transfer_backup_get_370);
  app.post("/api/settings/file-transfer-backup", settings_file_transfer_backup_post_371);
  app.get("/api/settings/retention", settings_retention_get_372);
  app.post("/api/settings/retention", settings_retention_post_373);
  app.get("/api/settings/storage-provider", settings_storage_provider_get_374);
  app.get("/api/settings/storage-provider/debug", settings_storage_provider_debug_get_375);
  app.post("/api/settings/storage-provider/test", settings_storage_provider_test_post_376);
  app.get("/api/settings/terminology", settings_terminology_get_377);
  app.post("/api/settings/terminology", settings_terminology_post_378);
  app.get("/api/settings/xero-credentials", settings_xero_credentials_get_379);
  app.post("/api/settings/xero-credentials", settings_xero_credentials_post_380);
}
