// Browser-side Better Auth client (React hooks). Used by the login/signup
// pages and AppShell. When auth is disabled on the server these calls 404,
// which the UI degrades gracefully from (the app runs in local mode).
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // Better Auth defaults to the same origin, which is what we want for the
  // web app. Explicit base URL is unnecessary.
});

export const { signIn, signUp, signOut, useSession } = authClient;