import { LegalPageShell } from "./legal/LegalPageShell";

export default function PrivacyPolicy() {
  return (
    <LegalPageShell title="Privacy Policy" lastUpdated="July 9, 2026">
      <h2>1. Who we are</h2>
      <p>
        Verdant Grow Diary is operated by{" "}
        <strong>Matthew Tyler Cheek</strong> (the "Seller"), an individual
        sole proprietor based in the United States. For the personal data
        described below, the Seller acts as the data controller.
      </p>

      <h2>2. What personal data we collect</h2>
      <ul>
        <li>
          <strong>Account data:</strong> email address, hashed password or
          OAuth identifier, display name.
        </li>
        <li>
          <strong>Grow content:</strong> diary entries, photos, cultivar
          notes, and other content you choose to upload.
        </li>
        <li>
          <strong>Sensor data:</strong> environmental readings you connect or
          upload (temperature, humidity, VPD, soil, etc.), including source
          labels and timestamps.
        </li>
        <li>
          <strong>Support communications:</strong> messages you send to
          support.
        </li>
        <li>
          <strong>Usage and telemetry:</strong> pages visited, features used,
          device type, browser, IP address, and error logs — used for
          security and product improvement.
        </li>
        <li>
          <strong>Payment metadata:</strong> subscription status, plan, and
          the last known transaction identifier from our payment provider.
          Full card details are handled by the payment provider and are never
          stored by us.
        </li>
      </ul>

      <h2>3. Why we process it (purposes and legal bases)</h2>
      <ul>
        <li>
          <strong>Providing the Service</strong> (contract performance) —
          creating your account, storing your grow data, generating reports,
          and running AI features you request.
        </li>
        <li>
          <strong>Security and fraud prevention</strong> (legitimate
          interests) — abuse detection, rate limiting, audit logs.
        </li>
        <li>
          <strong>Customer support</strong> (contract / legitimate interests)
          — responding to your inquiries.
        </li>
        <li>
          <strong>Product improvement</strong> (legitimate interests) —
          aggregate, non-identifying usage analysis.
        </li>
        <li>
          <strong>Legal compliance</strong> (legal obligation) — tax,
          accounting, and responding to lawful requests.
        </li>
        <li>
          <strong>Marketing communications</strong> — only with your consent,
          which you may withdraw at any time via the unsubscribe link.
        </li>
      </ul>

      <h2>4. Who we share data with</h2>
      <ul>
        <li>
          <strong>Merchant of Record — Paddle.com Market Ltd.</strong> Paddle
          processes payments, manages subscriptions, and handles refunds and
          tax compliance as the Merchant of Record for our orders.
        </li>
        <li>
          <strong>Infrastructure and hosting subprocessors</strong> —
          database, storage, edge function, and email delivery providers used
          to run the Service.
        </li>
        <li>
          <strong>Analytics</strong> — privacy-respecting analytics used to
          understand aggregate usage. See "Cookies" below.
        </li>
        <li>
          <strong>Professional advisers</strong> — legal, accounting, or
          insurance advisers where necessary.
        </li>
        <li>
          <strong>Authorities</strong> — where required by law or valid legal
          process.
        </li>
      </ul>
      <p>
        We do not sell your personal data. We do not share your grow content
        with third parties for marketing.
      </p>

      <h2>5. International transfers</h2>
      <p>
        The Service is operated from the United States. If you are located
        outside the United States, your data will be transferred to and
        processed in the United States. Where required (for example transfers
        from the UK or EEA), we rely on appropriate safeguards such as
        Standard Contractual Clauses.
      </p>

      <h2>6. Data retention</h2>
      <p>
        We retain personal data for as long as your account is active and for
        a reasonable period afterwards to meet legal, tax, and audit
        obligations. When data is no longer needed we delete or anonymize it.
        You can request export or deletion of your grow content at any time.
      </p>

      <h2>7. Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access,
        correct, delete, restrict, port, or object to our processing of your
        personal data, and to withdraw consent. UK/EEA users additionally
        have the right to lodge a complaint with their supervisory authority.
        To exercise these rights, email{" "}
        <a href="mailto:privacy@verdantgrowdiary.com">
          privacy@verdantgrowdiary.com
        </a>
        . We will respond within one month.
      </p>

      <h2>8. Security</h2>
      <p>
        We use appropriate technical and organizational measures to protect
        personal data, including encryption in transit, access controls,
        row-level security on user data, and audit logging. No system is
        perfectly secure; we will notify affected users of any material
        incident as required by law.
      </p>

      <h2>9. Cookies</h2>
      <p>We use a small number of cookies and similar technologies:</p>
      <ul>
        <li>
          <strong>Essential</strong> — required for authentication and to
          remember your session.
        </li>
        <li>
          <strong>Analytics</strong> — help us understand aggregate usage of
          the Service.
        </li>
      </ul>
      <p>
        You can manage cookies through your browser settings. Disabling
        essential cookies may prevent the Service from working.
      </p>

      <h2>10. Children</h2>
      <p>
        The Service is not directed to children under 16, and we do not
        knowingly collect personal data from them.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Material changes
        will be communicated in-app or by email.
      </p>

      <h2>12. Contact</h2>
      <p>
        Matthew Tyler Cheek — Verdant Grow Diary. Privacy inquiries:{" "}
        <a href="mailto:privacy@verdantgrowdiary.com">
          privacy@verdantgrowdiary.com
        </a>
        .
      </p>
    </LegalPageShell>
  );
}