import type { Express } from 'express';

import integrations_myob_auth_url_get_151 from "./api/integrations/myob/auth-url/GET";
import integrations_myob_callback_get_152 from "./api/integrations/myob/callback/GET";
import integrations_myob_disconnect_post_153 from "./api/integrations/myob/disconnect/POST";
import integrations_myob_status_get_154 from "./api/integrations/myob/status/GET";
import integrations_myob_sync_invoice_post_155 from "./api/integrations/myob/sync-invoice/POST";
import integrations_onedrive_auth_url_get_156 from "./api/integrations/onedrive/auth-url/GET";
import integrations_onedrive_callback_get_157 from "./api/integrations/onedrive/callback/GET";
import integrations_onedrive_disconnect_post_158 from "./api/integrations/onedrive/disconnect/POST";
import integrations_onedrive_status_get_159 from "./api/integrations/onedrive/status/GET";
import integrations_onedrive_upload_file_post_160 from "./api/integrations/onedrive/upload-file/POST";
import integrations_qbo_auth_url_get_161 from "./api/integrations/qbo/auth-url/GET";
import integrations_qbo_callback_get_162 from "./api/integrations/qbo/callback/GET";
import integrations_qbo_disconnect_post_163 from "./api/integrations/qbo/disconnect/POST";
import integrations_qbo_status_get_164 from "./api/integrations/qbo/status/GET";
import integrations_qbo_sync_invoice_post_165 from "./api/integrations/qbo/sync-invoice/POST";
import integrations_xero_auth_url_get_166 from "./api/integrations/xero/auth-url/GET";
import integrations_xero_callback_get_167 from "./api/integrations/xero/callback/GET";
import integrations_xero_disconnect_post_168 from "./api/integrations/xero/disconnect/POST";
import integrations_xero_status_get_169 from "./api/integrations/xero/status/GET";
import integrations_xero_sync_customer_post_170 from "./api/integrations/xero/sync-customer/POST";
import integrations_xero_sync_invoice_post_171 from "./api/integrations/xero/sync-invoice/POST";
import integrations_xero_webhook_post_172 from "./api/integrations/xero/webhook/POST";

export function register(app: Express): void {
  app.get("/api/integrations/myob/auth-url", integrations_myob_auth_url_get_151);
  app.get("/api/integrations/myob/callback", integrations_myob_callback_get_152);
  app.post("/api/integrations/myob/disconnect", integrations_myob_disconnect_post_153);
  app.get("/api/integrations/myob/status", integrations_myob_status_get_154);
  app.post("/api/integrations/myob/sync-invoice", integrations_myob_sync_invoice_post_155);
  app.get("/api/integrations/onedrive/auth-url", integrations_onedrive_auth_url_get_156);
  app.get("/api/integrations/onedrive/callback", integrations_onedrive_callback_get_157);
  app.post("/api/integrations/onedrive/disconnect", integrations_onedrive_disconnect_post_158);
  app.get("/api/integrations/onedrive/status", integrations_onedrive_status_get_159);
  app.post("/api/integrations/onedrive/upload-file", integrations_onedrive_upload_file_post_160);
  app.get("/api/integrations/qbo/auth-url", integrations_qbo_auth_url_get_161);
  app.get("/api/integrations/qbo/callback", integrations_qbo_callback_get_162);
  app.post("/api/integrations/qbo/disconnect", integrations_qbo_disconnect_post_163);
  app.get("/api/integrations/qbo/status", integrations_qbo_status_get_164);
  app.post("/api/integrations/qbo/sync-invoice", integrations_qbo_sync_invoice_post_165);
  app.get("/api/integrations/xero/auth-url", integrations_xero_auth_url_get_166);
  app.get("/api/integrations/xero/callback", integrations_xero_callback_get_167);
  app.post("/api/integrations/xero/disconnect", integrations_xero_disconnect_post_168);
  app.get("/api/integrations/xero/status", integrations_xero_status_get_169);
  app.post("/api/integrations/xero/sync-customer", integrations_xero_sync_customer_post_170);
  app.post("/api/integrations/xero/sync-invoice", integrations_xero_sync_invoice_post_171);
  app.post("/api/integrations/xero/webhook", integrations_xero_webhook_post_172);
}
