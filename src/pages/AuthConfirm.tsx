import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from "lucide-react";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type SupportedOtpType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email";

type ConfirmStatus = "idle" | "verifying" | "error";

const SUPPORTED_OTP_TYPES = new Set<SupportedOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

const clearAuthHash = () => {
  if (typeof window === "undefined") return;
  const base = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState({}, document.title, base);
};

const decodeCallbackMessage = (value: string | null) => {
  if (!value) return "";

  const normalized = String(value).replace(/\+/g, " ");
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
};

const normalizeOtpType = (value: string | null): SupportedOtpType | null => {
  const normalized = String(value || "").trim().toLowerCase();
  return SUPPORTED_OTP_TYPES.has(normalized as SupportedOtpType)
    ? (normalized as SupportedOtpType)
    : null;
};

const getDefaultNextPath = (type: SupportedOtpType | null) => {
  if (type === "invite") return "/auth?mode=invite";
  if (type === "recovery") return "/auth?mode=recovery";
  return "/auth";
};

const sanitizeNextPath = (value: string | null, fallback: string) => {
  if (!value || typeof window === "undefined") return fallback;

  try {
    const resolved = new URL(value, window.location.origin);
    if (resolved.origin !== window.location.origin) return fallback;
    const nextPath = `${resolved.pathname}${resolved.search}${resolved.hash}`;
    return nextPath || fallback;
  } catch {
    return fallback;
  }
};

const formatVerificationError = (message: string, type: SupportedOtpType | null) => {
  const normalized = String(message || "").trim();
  const lower = normalized.toLowerCase();

  if (lower.includes("otp_expired") || lower.includes("invalid or has expired")) {
    if (type === "invite") {
      return "This invitation link is invalid or has expired. Ask a workspace admin to send you a new invite.";
    }
    return "This verification link is invalid or has expired. Request a new one and try again.";
  }

  if (lower.includes("access_denied") && type === "invite") {
    return "This invitation could not be confirmed. Ask a workspace admin to send you a fresh invite.";
  }

  return normalized || "We could not verify this link.";
};

const getTitle = (type: SupportedOtpType | null, status: ConfirmStatus) => {
  if (status === "error") return "Verification failed";
  if (status === "verifying") return "Confirming secure link";
  if (type === "invite") return "Accept your workspace invitation";
  if (type === "recovery") return "Continue password reset";
  return "Confirm your email";
};

const getDescription = (type: SupportedOtpType | null, hasTokenHash: boolean) => {
  if (type === "invite") {
    return hasTokenHash
      ? "Use the button below to securely accept this invite and continue to password setup."
      : "We are finishing your invitation sign-in and preparing password setup.";
  }
  if (type === "recovery") {
    return hasTokenHash
      ? "Use the secure button below to continue your password reset."
      : "We are validating your reset link.";
  }
  return hasTokenHash
    ? "Use the secure button below to confirm this email action."
    : "We are validating your email link.";
};

const getActionLabel = (type: SupportedOtpType | null) => {
  if (type === "invite") return "Accept invitation";
  if (type === "recovery") return "Continue reset";
  return "Confirm email";
};

const AuthConfirm = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<ConfirmStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [otpType, setOtpType] = useState<SupportedOtpType | null>(() =>
    normalizeOtpType(searchParams.get("type"))
  );

  const tokenHash = String(searchParams.get("token_hash") || "").trim();

  const nextPath = useMemo(() => {
    const fallback = getDefaultNextPath(otpType);
    return sanitizeNextPath(searchParams.get("next"), fallback);
  }, [otpType, searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const rawHash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash || "";
    if (!rawHash) return;

    const hashParams = new URLSearchParams(rawHash);
    const callbackType = normalizeOtpType(hashParams.get("type"));
    if (callbackType) {
      setOtpType(callbackType);
    }

    const callbackError = decodeCallbackMessage(
      hashParams.get("error_description") || hashParams.get("error")
    );

    if (callbackError) {
      clearAuthHash();
      setStatus("error");
      setErrorMessage(formatVerificationError(callbackError, callbackType || otpType));
      return;
    }

    const accessToken = String(hashParams.get("access_token") || "").trim();
    const refreshToken = String(hashParams.get("refresh_token") || "").trim();
    if (!accessToken || !refreshToken) return;

    let cancelled = false;
    setStatus("verifying");

    void (async () => {
      const {
        data: { session: existingSession },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      if (
        existingSession?.access_token === accessToken &&
        existingSession?.refresh_token === refreshToken
      ) {
        clearAuthHash();
        navigate(nextPath, { replace: true });
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (cancelled) return;

      if (error) {
        clearAuthHash();
        setStatus("error");
        setErrorMessage(formatVerificationError(error.message, callbackType || otpType));
        return;
      }

      clearAuthHash();
      toast({
        title: callbackType === "invite" ? "Invitation accepted" : "Email verified",
        description:
          callbackType === "invite"
            ? "Continue by creating your password."
            : "Your secure link was verified successfully.",
      });
      navigate(nextPath, { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, nextPath, otpType]);

  const handleConfirm = async () => {
    if (!tokenHash) {
      setStatus("error");
      setErrorMessage("This secure link is missing its verification token.");
      return;
    }

    if (!otpType) {
      setStatus("error");
      setErrorMessage("This secure link is missing its verification type.");
      return;
    }

    setStatus("verifying");
    setErrorMessage("");

    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });

    if (error) {
      setStatus("error");
      setErrorMessage(formatVerificationError(error.message, otpType));
      return;
    }

    toast({
      title: otpType === "invite" ? "Invitation accepted" : "Email verified",
      description:
        otpType === "invite"
          ? "Continue by creating your password."
          : "Your secure link was verified successfully.",
    });
    navigate(nextPath, { replace: true });
  };

  const title = getTitle(otpType, status);
  const description = getDescription(otpType, Boolean(tokenHash));
  const isVerifying = status === "verifying";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.22),_transparent_40%),radial-gradient(circle_at_bottom,_rgba(59,130,246,0.18),_transparent_35%)]" />
      <div className="relative w-full max-w-lg overflow-hidden rounded-[32px] border border-white/10 bg-white/95 p-8 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.45)]">
        <div className="mb-8">
          <Logo />
        </div>

        <div className="space-y-3">
          <div className="inline-flex rounded-full bg-slate-100 p-3 text-slate-700">
            {status === "error" ? (
              <AlertCircle className="h-6 w-6" />
            ) : isVerifying ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : tokenHash ? (
              <MailCheck className="h-6 w-6" />
            ) : (
              <CheckCircle2 className="h-6 w-6" />
            )}
          </div>

          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          </div>
        </div>

        {errorMessage ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-8 space-y-3">
          {tokenHash ? (
            <Button
              type="button"
              className="h-11 w-full bg-slate-900 hover:bg-slate-800"
              onClick={() => void handleConfirm()}
              disabled={isVerifying}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirming...
                </>
              ) : (
                getActionLabel(otpType)
              )}
            </Button>
          ) : (
            <div className="flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600">
              {isVerifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Finishing secure sign-in...
                </>
              ) : (
                "Waiting for verification details..."
              )}
            </div>
          )}

          <Button asChild variant="outline" className="h-11 w-full">
            <Link to={nextPath}>Go to auth</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AuthConfirm;
