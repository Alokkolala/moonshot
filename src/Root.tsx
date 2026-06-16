import App from "./App";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AuthGate } from "./auth/AuthGate";

/** Decides between the auth screen and the app based on the Supabase session. */
function Gate() {
  const { session } = useAuth();

  if (session === undefined) {
    // Initial session still loading — avoid flashing the auth screen.
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  return session ? <App /> : <AuthGate />;
}

export default function Root() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
