/**
 * One customer-facing legal document: Terms, Fair Use, Privacy, System Policy.
 * Used by the in-app acknowledgement gate. Public /terms pages stay as URLs
 * and must stay Dazza-free.
 */
import type { ReactNode } from 'react';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[13px] font-bold text-gray-900">{title}</h3>
      <div className="space-y-2 text-[13px] leading-relaxed text-gray-600 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-1 [&_strong]:text-gray-800 [&_a]:text-violet-600">
        {children}
      </div>
    </section>
  );
}

function Policy({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <article id={id} className="space-y-4 pb-6 mb-2 border-b border-gray-100 last:border-0 last:pb-0">
      <h2 className="text-sm font-bold text-gray-900 tracking-tight">{title}</h2>
      {children}
    </article>
  );
}

const AI_COPY = (
  <>
    <p>
      IWILLBUILD uses AI for system monitoring, bug fixes, and to assist in resolving
      issues and improving performance. AI is not a customer-facing tool. Customers
      cannot access it.
    </p>
    <p>
      It must not be relied on as a substitute for a competent person, professional
      advice, or required sign-off. IWILLBUILD does not use customer job photos, SWMS
      or field records to train public foundation models.
    </p>
  </>
);

export const LEGAL_VERSION = 'v3.0';
export const LEGAL_JURISDICTION = 'Queensland, Australia';

export default function LegalDocument() {
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-gray-500">
        {LEGAL_VERSION} · {LEGAL_JURISDICTION} · ABN 89 791 350 823
      </p>
      <p className="text-[13px] text-gray-600 leading-relaxed">
        IWILLBUILD stores jobs, photos, safety records and GPS while you are signed in.
        Scroll this document, then acknowledge at the bottom. These terms apply to the
        website, portal and iPhone app.
      </p>

      <Policy id="terms" title="Terms of Use">
        <Section title="1. About IWILLBUILD">
          <p>
            IWILLBUILD is a construction and job-management platform operated from
            Queensland, Australia. It provides tools for jobs, estimates, forms, safety
            records, fleet, files, photos, invoices, scheduling and team coordination.
          </p>
          <p>
            By creating an account, accepting these Terms, or continuing to use the
            Service after notice of a material update, you agree to these Terms.
          </p>
        </Section>
        <Section title="2. Eligibility and accounts">
          <p>
            You must be legally able to enter these Terms. If you accept for a company,
            you confirm you are authorised to bind it. Keep passwords, PINs and devices
            secure. Notify support@iwillbuild.com if you suspect unauthorised access.
          </p>
        </Section>
        <Section title="3. Organisation data">
          <p>
            The subscribing organisation owns its business records. You grant IWILLBUILD
            a limited licence to host and process that content only as needed to provide,
            secure and support the Service. You are responsible for the accuracy and
            legality of content you enter.
          </p>
        </Section>
        <Section title="4. Acceptable use">
          <p>You must not use the Service to:</p>
          <ul>
            <li>upload unlawful, fraudulent, exploitative or seriously harmful content;</li>
            <li>upload child sexual abuse material or intimate images without consent;</li>
            <li>fake safety records, signatures, approvals or identities;</li>
            <li>access another account without authority, introduce malware, or evade security.</li>
          </ul>
        </Section>
        <Section title="5. Photos and Image Safeguard">
          <p>
            Capture and share photos only for lawful, work-related reasons. Check
            recipients before sharing. Uploaded job photos may be included in periodic,
            bounded Image Safeguard reviews. The safeguard may detect that a face appears
            as a privacy signal. It does not identify people or prove misconduct.
          </p>
        </Section>
        <Section title="6. Artificial intelligence">
          {AI_COPY}
        </Section>
        <Section title="7. Safety documents">
          <p>
            Templates, SWMS, risk assessments and safety materials are starting points
            only. A competent person must review, adapt and approve them for the actual
            work, site and hazards. The Service is not legal, engineering or safety advice.
          </p>
        </Section>
        <Section title="8. Billing, third parties and availability">
          <p>
            Plan prices are shown before purchase and exclude GST unless stated.
            Subscriptions renew until cancelled. Payments are processed by Stripe.
            The Service may connect to Xero, QuickBooks, Microsoft, Google, Cloudflare
            and others only when enabled by an authorised user.
          </p>
          <p>
            We aim for a reliable Service but do not guarantee uninterrupted operation.
          </p>
        </Section>
        <Section title="9. Law">
          <p>
            These Terms are governed by the laws of Queensland, Australia. Nothing
            excludes rights that cannot lawfully be excluded, including the Australian
            Consumer Law.
          </p>
        </Section>
      </Policy>

      <Policy id="fair-use" title="Fair Use Policy">
        <Section title="1. Purpose">
          <p>
            IWILLBUILD is a professional platform for construction organisations. Use it
            lawfully, honestly and with respect for others.
          </p>
        </Section>
        <Section title="2. Permitted use">
          <ul>
            <li>managing jobs, sites, crews and schedules;</li>
            <li>estimates, invoices and financial records;</li>
            <li>safety documents, SWMS, pre-starts and incident records;</li>
            <li>job-related photos, plans and documents;</li>
            <li>fleet, plant and team coordination.</li>
          </ul>
        </Section>
        <Section title="3. Prohibited content">
          <ul>
            <li>
              <strong>Child sexual abuse material (CSAM)</strong> — zero tolerance. Detected
              CSAM is reported to the Australian Federal Police and relevant authorities.
            </li>
            <li>Non-consensual intimate images (image-based abuse).</li>
            <li>Falsified safety documents, forged signatures or fabricated incident records.</li>
            <li>Malware, unauthorised personal information, or IP infringement.</li>
          </ul>
        </Section>
        <Section title="4. Photos">
          <p>
            Capture photos only for legitimate work. Do not use the camera to surveil or
            harass. Check context before sharing.
          </p>
        </Section>
        <Section title="5. Records and access">
          <p>
            Use your own account. Do not fake timesheets, signatures or safety sign-offs.
            Do not probe or bypass security. Report concerns to support@iwillbuild.com.
          </p>
        </Section>
      </Policy>

      <Policy id="privacy" title="Privacy Policy">
        <Section title="1. Who we are">
          <p>
            IWILLBUILD (ABN 89 791 350 823) operates from Queensland, Australia. We aim
            to follow the Australian Privacy Principles and, where relevant, New Zealand
            privacy law.
          </p>
        </Section>
        <Section title="2. What we collect">
          <ul>
            <li>Account, organisation, billing and login records;</li>
            <li>Job, site, crew, forms, safety, estimates and invoices;</li>
            <li>Photos, files, watermarks and documents;</li>
            <li>Fleet and GPS where a location feature is enabled;</li>
            <li>Device, app version, diagnostics and support records.</li>
          </ul>
        </Section>
        <Section title="3. Why we use it">
          <p>
            To provide and secure the Service, process subscriptions, detect misuse, and
            improve reliability. We do not sell personal information or use customer job
            records for third-party advertising.
          </p>
        </Section>
        <Section title="4. Artificial intelligence">
          {AI_COPY}
        </Section>
        <Section title="5. Image Safeguard">
          <p>
            Periodic, bounded reviews of uploaded job photos may record that a face
            appears. That is not identification, age detection or proof of a breach.
            Temporary working copies are deleted after processing.
          </p>
        </Section>
        <Section title="6. Sharing and overseas processing">
          <p>
            We disclose information to authorised users in your organisation, hosting
            and payment providers, and integrations you enable. Some providers store
            data outside Australia (including the United States). We take reasonable
            steps required by APP 8.
          </p>
        </Section>
        <Section title="7. Access, retention and complaints">
          <p>
            Email support@iwillbuild.com to access or correct personal information. We
            respond within 30 days. If unsatisfied in Australia, contact the OAIC
            (oaic.gov.au / 1300 363 992).
          </p>
        </Section>
      </Policy>

      <Policy id="system" title="System Policy">
        <Section title="1. Purpose">
          <p>
            This Policy covers platform systems, security, storage and how IWILLBUILD
            uses AI internally.
          </p>
        </Section>
        <Section title="2. Artificial intelligence">
          {AI_COPY}
          <p>
            IWILLBUILD does not use automated tools alone to hire, fire, discipline,
            approve credit, or make another decision that could significantly affect a
            person's legal rights.
          </p>
        </Section>
        <Section title="3. Security and storage">
          <p>
            Traffic uses HTTPS. Organisation data is isolated. Files are stored in
            cloud object storage (Cloudflare R2 or equivalent) with least-privilege
            access. Device permissions (camera, location, notifications) are requested
            only for the feature that needs them.
          </p>
        </Section>
        <Section title="4. Contact">
          <p>
            IWILLBUILD · Queensland, Australia · ABN 89 791 350 823
            <br />
            support@iwillbuild.com · www.iwillbuild.com
          </p>
        </Section>
      </Policy>
    </div>
  );
}
