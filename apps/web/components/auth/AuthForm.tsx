"use client";

import { loginSchema, registerSchema } from "@tracker/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { FileTag } from "@/components/paper/FileTag";
import { HairlineRule } from "@/components/paper/HairlineRule";
import { SerifHeading } from "@/components/paper/SerifHeading";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * Sign in / create account. One component for both, because the two forms differ
 * by a single field and sharing them keeps the validation identical.
 *
 * Validation runs against the SAME Zod schemas the API uses (@tracker/shared), so
 * a rule can never drift between the form and the server.
 */
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { status, signIn, signUp } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in (a refreshed cookie, or a back-button visit) — go home.
  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  const isRegister = mode === "register";

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const parsed = isRegister
      ? registerSchema.safeParse({
          email,
          password,
          ...(name.trim().length > 0 ? { name: name.trim() } : {}),
        })
      : loginSchema.safeParse({ email, password });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        next[key] ??= issue.message;
      }
      setFieldErrors(next);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      if (isRegister) {
        await signUp(parsed.data as { email: string; password: string; name?: string });
      } else {
        await signIn(parsed.data.email, parsed.data.password);
      }
      router.replace("/");
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Could not reach the server. Is the API running?",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-content px-unit py-unit-3">
      <header className="space-y-unit">
        <FileTag>{isRegister ? "NEW FILE" : "SIGN IN"}</FileTag>
        <SerifHeading level={1}>{isRegister ? "Start the journal" : "Open the journal"}</SerifHeading>
        <HairlineRule />
      </header>

      <form onSubmit={onSubmit} className="mt-unit-2 space-y-unit-2" noValidate>
        {isRegister ? (
          <TextField
            label="Name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={fieldErrors.name}
            hint="Optional."
          />
        ) : null}

        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldErrors.email}
        />

        <TextField
          label="Password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
          {...(isRegister ? { hint: "At least 12 characters." } : {})}
        />

        {formError !== null ? (
          <p role="alert" className="text-[0.9375rem] text-ink">
            {formError}
          </p>
        ) : null}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "…" : isRegister ? "Create account" : "Sign in"}
        </Button>
      </form>

      <HairlineRule className="my-unit-2" />

      <p className="text-[0.9375rem] text-ink-muted">
        {isRegister ? "Already have an account? " : "No account yet? "}
        <Link href={isRegister ? "/login" : "/register"} className="text-ink underline">
          {isRegister ? "Sign in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}
