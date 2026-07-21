import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — apted",
  description: "How apted collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h2 className="font-headline-xl text-headline-xl text-primary">Privacy Policy</h2>
        <p className="mt-1 text-label-sm uppercase tracking-wider text-on-surface-variant">
          Last updated: July 18, 2026
        </p>
      </div>

      <div className="space-y-8 text-body-md text-on-surface-variant">
        <section>
          <h3 className="font-headline-md text-headline-md text-on-surface">Overview</h3>
          <p className="mt-2">
            This is a placeholder privacy policy. apted takes your privacy seriously. We collect only the
            information needed to tailor your resumes and track your applications, and we never sell your
            data. The final policy will detail data retention, storage location, and your deletion rights.
          </p>
        </section>

        <section>
          <h3 className="font-headline-md text-headline-md text-on-surface">What we collect</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Account information (name, email address)</li>
            <li>Resume content you create or import</li>
            <li>Job descriptions you submit for tailoring</li>
            <li>Application metadata (company, role, status)</li>
          </ul>
        </section>

        <section>
          <h3 className="font-headline-md text-headline-md text-on-surface">How we use it</h3>
          <p className="mt-2">
            Your data is used to provide the resume tailoring and application tracking features. Resume and
            job description text may be sent to third-party language model providers to generate tailored
            drafts. We do not use your content to train models.
          </p>
        </section>

        <section>
          <h3 className="font-headline-md text-headline-md text-on-surface">Your rights</h3>
          <p className="mt-2">
            You can export or permanently delete your resume library and application history at any time from
            Settings. Contact us to request a full data export or account deletion.
          </p>
        </section>

        <section>
          <h3 className="font-headline-md text-headline-md text-on-surface">Contact</h3>
          <p className="mt-2">
            Questions about this policy can be sent to privacy@apted.app. This document will be replaced
            with the finalized policy before launch.
          </p>
        </section>
      </div>
    </div>
  );
}