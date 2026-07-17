"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

// Shared auth form for /login and /signup. Renders Better Auth's email/password
// flow plus Google/GitHub social sign-in buttons (the socials are only offered
// when the server has their creds; we don't know that on the client, so we show
// them and let the callback 404 gracefully if unset). On success we redirect to
// "/" so AppShell rehydrates with the session.

const primaryBtnCls =
  "inline-flex items-center justify-center gap-2 bg-primary text-on-primary text-body-md font-label-md px-4 py-2 rounded-lg hover:bg-on-surface transition-colors duration-200 disabled:opacity-50";
const secondaryBtnCls =
  "inline-flex items-center justify-center gap-2 bg-surface-container-low text-on-surface text-body-md px-4 py-2 rounded-lg border border-outline-variant hover:bg-surface-container transition-colors duration-200";
const inputCls =
  "w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary";

type Mode = "login" | "signup";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isSignup) {
        const { error } = await authClient.signUp.email({ email, password, name });
        if (error) throw new Error(error.message ?? "Sign up failed");
      } else {
        const { error } = await authClient.signIn.email({ email, password });
        if (error) throw new Error(error.message ?? "Sign in failed");
      }
      router.push("/");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

  async function social(provider: "google" | "github") {
    setError(null);
    await authClient.signIn.social({ provider, callbackURL: "/" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Link href="/" className="text-[28px] font-medium tracking-tight text-on-surface" style={{ fontFamily: "'Outfit', sans-serif" }}>
            apted
          </Link>
          <h1 className="mt-2 font-headline-lg text-headline-lg text-on-surface">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            {isSignup ? "Start tailoring resumes to every job." : "Sign in to tailor resumes for your next application."}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {isSignup && (
            <label className="block">
              <span className="block text-label-md font-label-md text-on-surface-variant mb-1">Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                className={inputCls}
              />
            </label>
          )}
          <label className="block">
            <span className="block text-label-md font-label-md text-on-surface-variant mb-1">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="block text-label-md font-label-md text-on-surface-variant mb-1">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={isSignup ? "new-password" : "current-password"}
              className={inputCls}
            />
          </label>

          {error && (
            <p className="text-body-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className={`${primaryBtnCls} w-full`}>
            {loading ? "…" : isSignup ? "Sign up" : "Sign in"}
          </button>
        </form>

        <div className="flex items-center gap-3 text-on-surface-variant text-label-sm">
          <div className="h-px flex-1 bg-outline-variant" />
          or
          <div className="h-px flex-1 bg-outline-variant" />
        </div>

        <div className="flex flex-col gap-2">
          <button onClick={() => social("google")} className={secondaryBtnCls}>
            <GoogleIcon /> Continue with Google
          </button>
          <button onClick={() => social("github")} className={secondaryBtnCls}>
            <GitHubIcon /> Continue with GitHub
          </button>
        </div>

        <p className="text-center text-body-sm text-on-surface-variant">
          {isSignup ? (
            <>Already have an account? <Link href="/login" className="text-primary font-label-md underline">Sign in</Link></>
          ) : (
            <>New here? <Link href="/signup" className="text-primary font-label-md underline">Create an account</Link></>
          )}
        </p>
      </div>
    </div>
  );
}

import Link from "next/link";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.93a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.26-4.74 3.26-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11.1 11.1 0 0 0 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.94c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.36-3.88-1.36-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.74-1.56-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.5 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.27 5.7.41.35.78 1.05.78 2.12v3.15c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z" />
    </svg>
  );
}