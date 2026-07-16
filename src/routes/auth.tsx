import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowRight, Loader2, Phone, KeyRound, ChevronLeft } from "lucide-react";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  component: AuthPage,
});

type Step = "phone" | "otp";

const COUNTRIES = [
  { code: "IN", dial: "+91", flag: "🇮🇳", name: "India" },
  { code: "US", dial: "+1", flag: "🇺🇸", name: "United States" },
  { code: "GB", dial: "+44", flag: "🇬🇧", name: "United Kingdom" },
  { code: "CA", dial: "+1", flag: "🇨🇦", name: "Canada" },
  { code: "AU", dial: "+61", flag: "🇦🇺", name: "Australia" },
  { code: "AE", dial: "+971", flag: "🇦🇪", name: "UAE" },
  { code: "SG", dial: "+65", flag: "🇸🇬", name: "Singapore" },
  { code: "DE", dial: "+49", flag: "🇩🇪", name: "Germany" },
  { code: "FR", dial: "+33", flag: "🇫🇷", name: "France" },
  { code: "BR", dial: "+55", flag: "🇧🇷", name: "Brazil" },
  { code: "JP", dial: "+81", flag: "🇯🇵", name: "Japan" },
] as const;

async function routeAfterAuth(
  navigate: ReturnType<typeof useNavigate>,
  fallback: string,
  userId: string,
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.onboarding_completed) navigate({ to: fallback as string });
  else navigate({ to: "/onboarding" });
}

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const fallback = (search.redirect as string) ?? "/dashboard";

  const [step, setStep] = useState<Step>("phone");
  const [agreed, setAgreed] = useState(false);
  const [countryIdx, setCountryIdx] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [localPhone, setLocalPhone] = useState("");
  const [phone, setPhone] = useState(""); // full E.164 after send
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const phoneRef = useRef<HTMLInputElement | null>(null);
  const otpRef = useRef<HTMLInputElement | null>(null);
  const country = COUNTRIES[countryIdx];

  useEffect(() => {
    // Always sign out on landing so OTP flow runs from scratch.
    supabase.auth.signOut().catch(() => {});
  }, []);


  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const DUMMY_OTP = "123456";
  const dummyEmailFor = (p: string) =>
    `phone${p.replace(/[^\d]/g, "")}@pinearn.dev`;
  const dummyPasswordFor = (p: string) =>
    `pinearn-otp-${p.replace(/[^\d]/g, "")}`;

  const [otpError, setOtpError] = useState(false);
  const digitRefs = useRef<Array<HTMLInputElement | null>>([]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const currentPhone = phoneRef.current?.value ?? localPhone;
    const digits = currentPhone.replace(/[^\d]/g, "").slice(0, 10);
    if (digits.length !== 10) {
      return toast.error("Enter a valid 10-digit phone number");
    }
    const p = `${country.dial}${digits}`;
    setLocalPhone(digits);
    setSending(true);
    await new Promise((r) => setTimeout(r, 400));
    setPhone(p);
    setOtp("");
    setOtpError(false);
    setStep("otp");
    setResendIn(30);
    setTimeout(() => digitRefs.current[0]?.focus(), 100);
    setSending(false);
  }

  function handleDigitChange(i: number, val: string) {
    const d = val.replace(/\D/g, "").slice(-1);
    const arr = otp.padEnd(6, " ").split("");
    arr[i] = d || " ";
    const next = arr.join("").trimEnd();
    setOtp(next);
    setOtpError(false);
    if (d && i < 5) digitRefs.current[i + 1]?.focus();
  }

  function handleDigitKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !(e.currentTarget.value) && i > 0) {
      digitRefs.current[i - 1]?.focus();
    }
  }

  function handleDigitPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    setOtp(text);
    setOtpError(false);
    digitRefs.current[Math.min(text.length, 5)]?.focus();
  }

  async function verifyCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (otp.trim() !== DUMMY_OTP) {
      setOtpError(true);
      return;
    }
    setVerifying(true);
    try {
      const email = dummyEmailFor(phone);
      const password = dummyPasswordFor(phone);
      let { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: phone } },
        });
        if (signUpError) throw signUpError;
        ({ data, error } = await supabase.auth.signInWithPassword({ email, password }));
        if (error) throw error;
      }
      if (!data.user) throw new Error("Verification failed");
      toast.success("Signed in");
      await routeAfterAuth(navigate, fallback, data.user.id);
    } catch (err) {
      setOtpError(true);
      toast.error(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setVerifying(false);
    }
  }


  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-8">
      {/* Animated gradient blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-blob absolute -left-20 -top-20 h-96 w-96 rounded-full bg-primary/20 blur-[100px]" />
        <div className="animate-blob-delay-2 absolute -right-20 top-1/4 h-80 w-80 rounded-full bg-accent/25 blur-[90px]" />
        <div className="animate-blob-delay-4 absolute bottom-0 left-1/3 h-[28rem] w-[28rem] rounded-full bg-chart-5/15 blur-[120px]" />
        <div className="animate-blob absolute bottom-1/4 right-1/4 h-64 w-64 rounded-full bg-primary/10 blur-[80px]" />
      </div>

      {/* Subtle dot pattern overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `radial-gradient(circle, var(--foreground) 1px, transparent 1px)`,
          backgroundSize: `32px 32px`,
        }}
      />

      {/* Floating decorative shapes */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float absolute left-[8%] top-[15%] h-4 w-4 rotate-45 rounded-sm bg-primary/30" />
        <div className="animate-float-delay absolute right-[12%] top-[22%] h-3 w-3 rounded-full bg-accent/40" />
        <div className="animate-float absolute left-[15%] bottom-[20%] h-5 w-5 rounded-lg bg-chart-5/25" />
        <div className="animate-float-delay absolute right-[18%] bottom-[18%] h-3.5 w-3.5 rotate-12 rounded-md bg-primary/25" />
        <div className="animate-float absolute left-[35%] top-[8%] h-2 w-2 rounded-full bg-accent/30" />
        <div className="animate-float-delay absolute right-[30%] bottom-[12%] h-2.5 w-2.5 rotate-45 rounded-sm bg-chart-5/30" />
      </div>

      {/* Mesh gradient overlay for depth */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 80% 50% at 50% -20%, oklch(0.72 0.16 45 / 0.12), transparent),
            radial-gradient(ellipse 60% 40% at 80% 80%, oklch(0.55 0.23 25 / 0.08), transparent)`,
        }}
      />

      <Link to="/" className="absolute left-5 top-5 z-10 flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary shadow-glow">
          <span className="font-display text-xs font-bold text-primary-foreground">P</span>
        </div>
        <span className="font-display text-base font-semibold">Pinearn</span>
      </Link>

      <div className="relative z-10 w-full sm:max-w-lg">
        <div className="rounded-3xl border border-border bg-surface/85 px-5 py-6 shadow-elevate backdrop-blur-xl sm:p-8">
          <h1 className="font-display text-2xl font-semibold leading-tight">
            {step === "phone" ? "Sign in with your phone" : "Enter the code"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {step === "phone"
              ? "We'll text you a one-time code to sign in."
              : `We sent a code to ${phone}`}
          </p>


          {step === "phone" ? (
            <form onSubmit={sendCode} className="mt-5">
              <label className="mb-2 block text-base font-medium text-foreground">
                Phone Number
              </label>
              <div className="flex items-stretch gap-2.5">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setPickerOpen((v) => !v)}
                    className="flex h-full items-center gap-2 rounded-xl border border-input bg-surface-2 px-4 py-3 text-base font-medium hover:bg-surface"
                    aria-label="Select country"
                  >
                    <span className="text-lg leading-none">{country.flag}</span>
                    <span>{country.dial}</span>
                  </button>
                  {pickerOpen && (
                    <div className="absolute left-0 top-[calc(100%+6px)] z-40 max-h-64 w-60 overflow-auto rounded-xl border border-border bg-surface p-1.5 shadow-elevate">
                      {COUNTRIES.map((c, i) => (
                        <button
                          type="button"
                          key={c.code}
                          onClick={() => {
                            setCountryIdx(i);
                            setPickerOpen(false);
                          }}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-base hover:bg-surface-2 ${
                            i === countryIdx ? "bg-surface-2" : ""
                          }`}
                        >
                          <span className="text-lg leading-none">{c.flag}</span>
                          <span className="flex-1 truncate">{c.name}</span>
                          <span className="text-muted-foreground">{c.dial}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 py-0.5 focus-within:border-primary/60">
                  <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    ref={phoneRef}
                    type="tel"
                    required
                    autoComplete="tel-national"
                    inputMode="numeric"
                    value={localPhone}
                    maxLength={10}
                    onChange={(e) => setLocalPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="Enter phone number"
                    className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </div>
              <label className="mt-4 flex items-start gap-2.5 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-primary/40"
                />
                <span>
                  I agree to the{" "}
                  <Link to="/privacy" target="_blank" className="font-semibold text-primary hover:underline">
                    Privacy Policy
                  </Link>{" "}
                  and Terms, including how Pinearn uses my phone number and Pinterest data.
                </span>
              </label>
              <button
                type="submit"
                disabled={sending || !agreed}
                className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-primary px-5 py-4 text-base font-semibold text-primary-foreground shadow-glow transition disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                Get OTP
              </button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="mt-5">
              {otpError && (
                <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                  <span className="grid h-5 w-5 place-items-center rounded-full border border-destructive text-xs">!</span>
                  Incorrect OTP. Please try again.
                </div>
              )}
              <p className="mb-2.5 text-center text-sm text-muted-foreground">Enter 6-digit code</p>
              <p className="mb-3 text-center text-xs text-muted-foreground/70">Dummy OTP is 123456</p>
              <div className="flex items-center justify-center gap-1 sm:gap-1.5">
                {Array.from({ length: 6 }).map((_, i) => {
                  const val = otp[i] ?? "";
                  const focused = otp.length === i;
                  return (
                    <input
                      key={i}
                      ref={(el) => { digitRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      autoComplete={i === 0 ? "one-time-code" : "off"}
                      pattern="[0-9]*"
                      maxLength={1}
                      value={val}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleDigitKey(i, e)}
                      onPaste={handleDigitPaste}
                      onFocus={(e) => e.currentTarget.select()}
                      className={`aspect-square rounded-2xl border bg-surface-2 text-center font-display text-2xl font-semibold outline-none transition-all ${
                        otpError
                          ? "border-destructive/50"
                          : focused || val
                            ? "border-primary ring-2 ring-primary/30 scale-110 bg-background shadow-glow"
                            : "border-border"
                      } ${focused || val ? "w-12 h-12 text-xl sm:w-14 sm:h-14 sm:text-2xl" : "w-11 h-11 text-lg sm:w-14 sm:h-14 sm:text-2xl"}`}
                    />
                  );
                })}
              </div>
              <button
                type="submit"
                disabled={verifying || otp.length < 6}
                className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-primary px-5 py-3.5 text-base font-semibold text-primary-foreground shadow-glow transition disabled:opacity-60 sm:py-4"
              >
                {verifying ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                Verify & Continue
              </button>

              <div className="mt-4 flex items-center justify-center gap-3 text-sm">
                <span className="text-muted-foreground">
                  {resendIn > 0 ? (
                    `Resend in ${resendIn}s`
                  ) : (
                    <button
                      type="button"
                      onClick={() => sendCode()}
                      disabled={sending}
                      className="font-medium text-primary"
                    >
                      {sending ? "Sending…" : "Resend"}
                    </button>
                  )}
                </span>
                <span className="text-border">·</span>
                <button
                  type="button"
                  onClick={() => {
                    setStep("phone");
                    setOtp("");
                    setOtpError(false);
                  }}
                  className="font-semibold text-foreground hover:text-primary"
                >
                  Change number
                </button>
              </div>
            </form>

          )}
        </div>
      </div>
    </div>
  );
}
