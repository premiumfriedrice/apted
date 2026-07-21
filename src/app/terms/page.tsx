import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — apted",
  description: "The terms under which you may use apted.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h2 className="font-headline-xl text-headline-xl text-primary">Terms of Service</h2>
        <p className="mt-1 text-label-sm uppercase tracking-wider text-on-surface-variant">
          Last updated: July 18, 2026
        </p>
      </div>

      <div className="space-y-8 text-body-md text-on-surface-variant">
        <section>
          <h3 className="font-headline-md text-headline-md text-on-surface">Overview</h3>
          <p className="mt-2">
            This is a placeholder terms of service document. By creating an account or using apted you agree
            to these terms. The final terms will be published before launch.
          </p>
        </section>

        <section>
          <h3 className="font-headline-md text-headline-md text-on-surface">Your account</h3>
          <p className="mt-2">
            You are responsible for keeping your credentials secure and for activity that occurs under your
            account. You must be accurate when providing registration information.
          </p>
        </section>

        <section>
          <h3 className="font-headline-md text-headline-md text-on-surface">The service</h3>
          <p className="mt-2">
            apted is provided on an &quot;as is&quot; basis. We may change features, pricing, or availability
            at any time, and we are not liable for any resume content you generate or any employment
            outcome resulting from use of the service.
          </p>
        </section>

        <section>
          <h3 className="font-headline-md text-headline-md text-on-surface">Termination</h3>
          <p className="mt-2">
            You may delete your account at any time. We may suspend or terminate access if these terms are
            violated or to protect the service.
          </p>
        </section>

        <section>
          <h3 className="font-headline-md text-headline-md text-on-surface">Contact</h3>
          <p className="mt-2">
            Questions about these terms can be sent to legal@apted.app.
          </p>
        </section>
      </div>
    </div>
  );
}