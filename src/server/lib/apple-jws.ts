import { createVerify, X509Certificate } from 'crypto';

export const APPLE_COMPANY_MONTHLY_ID = 'com.iwillbuild.portal.company.monthly';
export const APPLE_BUNDLE_ID = 'com.iwillbuild.portal';

const APPLE_ROOT_G3 = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

export interface AppleTransaction {
  bundleId: string;
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  expiresDate: number;
  environment: string;
}

export function verifyAppleTransaction(jws: string, now = Date.now()): AppleTransaction {
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('Invalid Apple transaction.');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(decode(encodedHeader).toString('utf8')) as { x5c?: string[] };
  const payload = JSON.parse(decode(encodedPayload).toString('utf8')) as Record<string, unknown>;
  const certificates = (header.x5c ?? []).map((encoded) => new X509Certificate(Buffer.from(encoded, 'base64')));
  if (certificates.length < 2) throw new Error('Apple certificate chain missing.');

  const verifier = createVerify('SHA256');
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();
  if (!verifier.verify(certificates[0].publicKey, joseToDer(decode(encodedSignature)))) {
    throw new Error('Apple signature failed.');
  }

  const root = new X509Certificate(APPLE_ROOT_G3);
  for (let index = 0; index < certificates.length - 1; index += 1) {
    if (!certificates[index].verify(certificates[index + 1].publicKey)) {
      throw new Error('Apple certificate chain failed.');
    }
  }
  const anchor = certificates[certificates.length - 1];
  if (anchor.fingerprint256 !== root.fingerprint256 && !anchor.verify(root.publicKey)) {
    throw new Error('Apple root certificate mismatch.');
  }

  const transaction: AppleTransaction = {
    bundleId: String(payload.bundleId ?? ''),
    productId: String(payload.productId ?? ''),
    transactionId: String(payload.transactionId ?? ''),
    originalTransactionId: String(payload.originalTransactionId ?? ''),
    expiresDate: Number(payload.expiresDate ?? 0),
    environment: String(payload.environment ?? ''),
  };
  if (transaction.bundleId !== APPLE_BUNDLE_ID) throw new Error('This purchase is for a different app.');
  if (transaction.productId !== APPLE_COMPANY_MONTHLY_ID) throw new Error('This is not the company subscription.');
  if (!transaction.originalTransactionId) throw new Error('Apple did not provide a transaction id.');
  if (payload.revocationDate) throw new Error('Apple has revoked this subscription.');
  if (!Number.isFinite(transaction.expiresDate) || transaction.expiresDate <= now) {
    throw new Error('This Apple subscription is not active.');
  }
  return transaction;
}

function decode(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function joseToDer(raw: Buffer): Buffer {
  if (raw.length !== 64) throw new Error('Invalid Apple signature.');
  const part = (offset: number) => {
    let value = raw.subarray(offset, offset + 32);
    let start = 0;
    while (start < value.length - 1 && value[start] === 0) start += 1;
    value = value.subarray(start);
    if (value[0] & 0x80) value = Buffer.concat([Buffer.from([0x00]), value]);
    return value;
  };
  const r = part(0);
  const s = part(32);
  const body = Buffer.concat([Buffer.from([0x02, r.length]), r, Buffer.from([0x02, s.length]), s]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}
